import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Audit } from '@/lib/auditStorage';
import type { 
  AuditTemplate, 
  TemplateSection, 
  TemplateItem, 
} from '@/lib/templateStorage';
import { fetchTemplateById } from '@/lib/templateSupabase';
import {
  AuditResult,
  AuditItemResponse,
  CAPAPriority,
  FindingSeverity,
  getAssigneeForCAPA,
  calculateDueDate,
} from '@/lib/auditExecutionStorage';
import { fetchAuditById, updateAudit } from '@/lib/auditSupabase';
import { fetchUserIdsByRole, insertNotifications } from '@/lib/notificationsSupabase';
import { fetchDepartmentUserIds, getDepartmentId, getEntityManagerId } from '@/lib/departmentSupabase';
import { supabase } from '@/integrations/supabase/client';
import {
  createSignedAuditEvidenceUrls,
  fetchAuditResults,
  fetchCAPAsByAuditId,
  fetchFindingsByAuditId,
  insertCAPAs,
  insertFindings,
  upsertAuditResults,
  uploadAuditEvidenceFilePath,
} from '@/lib/executionSupabase';

export interface AuditExecutionItemState {
  response: AuditItemResponse | null;
  evidenceFiles: File[];
  evidenceUrls: string[];
  evidencePaths: string[];
  manualFinding: string;
  capaPriority: CAPAPriority | null;
  capaDueDate: string | null; // YYYY-MM-DD
}

interface SectionScore {
  sectionId: string;
  sectionName: string;
  pointsEarned: number;
  maxPoints: number;
  weight: number;
  percentage: number;
}

interface ScoreResult {
  totalScore: number;
  passFail: 'pass' | 'fail';
  criticalFail: boolean;
  sectionScores: SectionScore[];
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  scrollToItemId?: string;
}

export function useAuditExecution(auditId: string) {
  const queryClient = useQueryClient();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [template, setTemplate] = useState<AuditTemplate | null>(null);
  const [itemStates, setItemStates] = useState<Map<string, AuditExecutionItemState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSavedSignatureRef = useRef<string>('');
  const [submittedFindings, setSubmittedFindings] = useState<any[]>([]);
  const [submittedCAPAs, setSubmittedCAPAs] = useState<any[]>([]);

  const buildDraftSignature = (states: Map<string, AuditExecutionItemState>): string => {
    const rows: any[] = [];
    const keys = Array.from(states.keys()).sort();
    for (const k of keys) {
      const s = states.get(k);
      if (!s) continue;
      rows.push([
        k,
        s.response ?? null,
        (s.evidencePaths ?? []).slice().sort(),
        s.manualFinding ?? '',
        s.capaPriority ?? null,
        s.capaDueDate ?? null,
        (s.evidenceFiles ?? []).map((f) => `${f.name}:${f.size}:${f.lastModified}`),
      ]);
    }
    return JSON.stringify(rows);
  };

  // Load audit, template, and existing results
  useEffect(() => {
    let cancelled = false;
    const loadAudit = async () => {
      setIsLoading(true);
      try {
        if (!auditId) return;

        // Fetch audit, then independent data in parallel
        const loadedAudit = await fetchAuditById(auditId);
        if (!loadedAudit) return;

        const [loadedTemplate, existingResults] = await Promise.all([
          fetchTemplateById(loadedAudit.template_id),
          fetchAuditResults(auditId),
        ]);

        if (!loadedTemplate) return;

        if (cancelled) return;

        setAudit(loadedAudit);
        setTemplate(loadedTemplate);

        const statesMap = new Map<string, AuditExecutionItemState>();

        // Collect all evidence paths to sign in one batch
        const allPaths: { itemId: string; paths: string[] }[] = [];
        for (const section of loadedTemplate.checklist_json.sections) {
          for (const item of section.items) {
            const existingResult = existingResults.find(r => r.item_id === item.id);
            const evidencePaths = existingResult?.evidence_urls || [];
            if (evidencePaths.length > 0) {
              allPaths.push({ itemId: item.id, paths: evidencePaths });
            }
          }
        }

        // Batch sign all paths
        const flatPaths = allPaths.flatMap(p => p.paths);
        const signedUrls = flatPaths.length > 0 
          ? await createSignedAuditEvidenceUrls(flatPaths)
          : [];

        // Map signed URLs back to items
        let urlIdx = 0;
        const signedUrlsByItem = new Map<string, string[]>();
        for (const p of allPaths) {
          signedUrlsByItem.set(p.itemId, signedUrls.slice(urlIdx, urlIdx + p.paths.length));
          urlIdx += p.paths.length;
        }

        // Initialize all items
        for (const section of loadedTemplate.checklist_json.sections) {
          for (const item of section.items) {
            const existingResult = existingResults.find(r => r.item_id === item.id);
            const evidencePaths = existingResult?.evidence_urls || [];
            statesMap.set(item.id, {
              response: existingResult?.response || null,
              evidenceFiles: [],
              evidenceUrls: signedUrlsByItem.get(item.id) || [],
              evidencePaths,
              manualFinding: existingResult?.manual_finding ?? '',
              capaPriority: null,
              capaDueDate: null,
            });
          }
        }

        if (cancelled) return;

        setItemStates(statesMap);
        lastSavedSignatureRef.current = buildDraftSignature(statesMap);

        // If audit is completed, findings/CAPA are not loaded here yet.
        if (['submitted', 'approved', 'rejected', 'pending_verification'].includes(loadedAudit.status)) {
          const [dbFindings, dbCapas] = await Promise.all([
            fetchFindingsByAuditId(loadedAudit.id),
            fetchCAPAsByAuditId(loadedAudit.id),
          ]);
          if (!cancelled) {
            setSubmittedFindings(dbFindings);
            setSubmittedCAPAs(dbCapas);
          }
        }

      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadAudit();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const markAuditInProgressIfNeeded = useCallback(async () => {
    if (!auditId) return;
    if (!audit) return;
    if (audit.status !== 'scheduled') return;

    const startedAt = audit.started_at ?? new Date().toISOString();

    const prevAudit = audit;

    setAudit(prev => prev ? {
      ...prev,
      status: 'in_progress',
      started_at: startedAt,
    } : null);

    try {
      await updateAudit(auditId, {
        status: 'in_progress',
        started_at: startedAt,
      });
      await queryClient.invalidateQueries({ queryKey: ['audits'] });
    } catch (e) {
      console.error('Failed to mark audit in progress', e);
      setAudit((cur) => (cur?.id === prevAudit.id ? prevAudit : cur));
    }
  }, [audit, auditId, queryClient]);

  // Update item response
  const updateItemResponse = useCallback((itemId: string, response: AuditItemResponse) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        evidencePaths: [],
        manualFinding: '',
        capaPriority: null,
        capaDueDate: null,
      };
      newMap.set(itemId, { ...current, response });
      return newMap;
    });

    if (response?.value !== null) {
      void markAuditInProgressIfNeeded();
    }
  }, [markAuditInProgressIfNeeded]);

  // Add evidence file
  const addEvidenceFile = useCallback((itemId: string, file: File) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        evidencePaths: [],
        manualFinding: '',
        capaPriority: null,
        capaDueDate: null,
      };
      newMap.set(itemId, {
        ...current,
        evidenceFiles: [...current.evidenceFiles, file],
      });
      return newMap;
    });
  }, []);

  // Remove evidence file
  const removeEvidenceFile = useCallback((itemId: string, fileIndex: number) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId);
      if (!current) return prev;
      
      newMap.set(itemId, {
        ...current,
        evidenceFiles: current.evidenceFiles.filter((_, i) => i !== fileIndex),
      });
      return newMap;
    });
  }, []);

  // Remove existing evidence URL
  const removeEvidenceUrl = useCallback((itemId: string, urlIndex: number) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId);
      if (!current) return prev;
      
      newMap.set(itemId, {
        ...current,
        evidenceUrls: current.evidenceUrls.filter((_, i) => i !== urlIndex),
        evidencePaths: current.evidencePaths.filter((_, i) => i !== urlIndex),
      });
      return newMap;
    });
  }, []);

  // Update manual finding note
  const updateManualFinding = useCallback((itemId: string, note: string) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        evidencePaths: [],
        manualFinding: '',
        capaPriority: null,
        capaDueDate: null,
      };
      newMap.set(itemId, { ...current, manualFinding: note });
      return newMap;
    });
  }, []);

  const updateItemCAPAPriority = useCallback((itemId: string, priority: CAPAPriority | null) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        evidencePaths: [],
        manualFinding: '',
        capaPriority: null,
        capaDueDate: null,
      };
      newMap.set(itemId, { ...current, capaPriority: priority });
      return newMap;
    });
  }, []);

  const updateItemCAPADueDate = useCallback((itemId: string, dueDate: string | null) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        evidencePaths: [],
        manualFinding: '',
        capaPriority: null,
        capaDueDate: null,
      };
      newMap.set(itemId, { ...current, capaDueDate: dueDate });
      return newMap;
    });
  }, []);

  const flushEvidenceUploads = useCallback(async (auditIdForPaths: string, templateForItems: AuditTemplate) => {
    const jobs: Array<{ itemId: string; file: File }> = [];

    for (const section of templateForItems.checklist_json.sections) {
      for (const item of section.items) {
        const current = itemStates.get(item.id);
        if (!current) continue;
        if (current.evidenceFiles.length === 0) continue;

        for (const file of current.evidenceFiles) {
          jobs.push({ itemId: item.id, file });
        }
      }
    }

    if (jobs.length === 0) {
      return new Map(itemStates);
    }

    const uploadedByJobIdx: Array<{ itemId: string; path: string } | null> = new Array(jobs.length).fill(null);

    let cursor = 0;
    const concurrency = 5;
    const workers = Array.from({ length: Math.min(concurrency, jobs.length) }).map(async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= jobs.length) return;
        const job = jobs[idx];
        const res = await uploadAuditEvidenceFilePath(auditIdForPaths, job.itemId, job.file);
        uploadedByJobIdx[idx] = { itemId: job.itemId, path: res.path };
      }
    });

    await Promise.all(workers);

    const allNewPaths = uploadedByJobIdx
      .map((r) => r?.path)
      .filter((p): p is string => !!p);

    const chunkSize = 50;
    const signedUrls: string[] = [];
    for (let i = 0; i < allNewPaths.length; i += chunkSize) {
      const chunk = allNewPaths.slice(i, i + chunkSize);
      const signed = await createSignedAuditEvidenceUrls(chunk);
      signedUrls.push(...signed);
    }

    const nextSignedByPath = new Map<string, string>();
    for (let i = 0; i < allNewPaths.length; i++) {
      nextSignedByPath.set(allNewPaths[i], signedUrls[i] ?? allNewPaths[i]);
    }

    const updatesByItemId = new Map<string, { paths: string[]; urls: string[] }>();
    for (const row of uploadedByJobIdx) {
      if (!row) continue;
      const signed = nextSignedByPath.get(row.path) ?? row.path;
      const existing = updatesByItemId.get(row.itemId) ?? { paths: [], urls: [] };
      existing.paths.push(row.path);
      existing.urls.push(signed);
      updatesByItemId.set(row.itemId, existing);
    }

    let mergedOut: Map<string, AuditExecutionItemState> | null = null;
    setItemStates(prev => {
      const merged = new Map(prev);

      for (const [itemId, update] of updatesByItemId) {
        const current = merged.get(itemId);
        if (!current) continue;
        merged.set(itemId, {
          ...current,
          evidenceFiles: [],
          evidencePaths: [...current.evidencePaths, ...update.paths],
          evidenceUrls: [...current.evidenceUrls, ...update.urls],
        });
      }

      mergedOut = merged;
      return merged;
    });

    return mergedOut ?? new Map(itemStates);
  }, [itemStates]);

  // Calculate points for an item
  const calculateItemPoints = useCallback((
    item: TemplateItem,
    state: AuditExecutionItemState
  ): number => {
    if (!state.response) return 0;
    const value = state.response.value;

    switch (item.type) {
      case 'pass_fail':
        return value === 'pass' ? item.points : 0;
      
      case 'rating':
        if (typeof value === 'number' && !Number.isNaN(value)) {
          const scale = Math.max(1, item.points || 5);
          return Math.min(scale, Math.max(0, value));
        }
        return 0;
      
      case 'numeric':
        if (typeof value === 'number' && !Number.isNaN(value)) {
          return Math.min(item.points, Math.max(0, value));
        }
        return 0;
      
      case 'photo':
        const totalEvidence = state.evidenceFiles.length + state.evidenceUrls.length;
        return totalEvidence > 0 ? item.points : 0;
      
      case 'text':
        return typeof value === 'string' && value.trim() !== '' ? item.points : 0;
      
      case 'checklist':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const checkedCount = Object.values(value as Record<string, boolean>).filter(Boolean).length;
          const totalCount = Object.keys(value as Record<string, boolean>).length;
          return totalCount > 0 ? (checkedCount / totalCount) * item.points : 0;
        }
        return 0;
      
      default:
        return 0;
    }
  }, []);

  // Calculate score in real-time
  const scoreResult = useMemo((): ScoreResult => {
    if (!template) {
      return { totalScore: 0, passFail: 'fail', criticalFail: false, sectionScores: [] };
    }

    const { sections } = template.checklist_json;
    const { scoring_config } = template;
    const sectionScores: SectionScore[] = [];
    let criticalFail = false;

    // Check for critical failures
    if (scoring_config.critical_fail_rule) {
      for (const section of sections) {
        for (const item of section.items) {
          if (!item.critical) continue;
          
          const state = itemStates.get(item.id);
          if (!state?.response) continue;
          
          const value = state.response.value;
          
          if (item.type === 'pass_fail' && value === 'fail') {
            criticalFail = true;
          } else if (item.type === 'rating' && typeof value === 'number' && value === 1) {
            criticalFail = true;
          } else if (item.type === 'checklist' && typeof value === 'object' && value !== null) {
            const hasUnchecked = Object.values(value as Record<string, boolean>).some(v => !v);
            if (hasUnchecked) criticalFail = true;
          }
        }
      }
    }

    // Calculate section scores
    for (const section of sections) {
      let sectionPointsEarned = 0;
      let sectionMaxPoints = 0;

      for (const item of section.items) {
        const state = itemStates.get(item.id);
        sectionMaxPoints += item.points;
        if (state) {
          sectionPointsEarned += calculateItemPoints(item, state);
        }
      }

      const percentage = sectionMaxPoints > 0 
        ? (sectionPointsEarned / sectionMaxPoints) * 100 
        : 0;

      sectionScores.push({
        sectionId: section.id,
        sectionName: section.name,
        pointsEarned: sectionPointsEarned,
        maxPoints: sectionMaxPoints,
        weight: section.weight,
        percentage,
      });
    }

    // Calculate total score
    let totalScore: number;
    
    if (scoring_config.weighted) {
      totalScore = sectionScores.reduce((acc, section) => {
        return acc + (section.percentage * section.weight / 100);
      }, 0);
    } else {
      const totalPointsEarned = sectionScores.reduce((acc, s) => acc + s.pointsEarned, 0);
      const totalMaxPoints = sectionScores.reduce((acc, s) => acc + s.maxPoints, 0);
      totalScore = totalMaxPoints > 0 ? (totalPointsEarned / totalMaxPoints) * 100 : 0;
    }

    const passFail: 'pass' | 'fail' = 
      criticalFail ? 'fail' :
      totalScore >= scoring_config.pass_threshold ? 'pass' : 'fail';

    return { totalScore, passFail, criticalFail, sectionScores };
  }, [template, itemStates, calculateItemPoints]);

  // Calculate completion stats
  const completionStats = useMemo(() => {
    if (!template) return { answered: 0, total: 0, percentage: 0 };

    let total = 0;
    let answered = 0;

    for (const section of template.checklist_json.sections) {
      for (const item of section.items) {
        total++;
        const state = itemStates.get(item.id);
        if (state?.response !== null) {
          answered++;
        }
      }
    }

    return {
      answered,
      total,
      percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
    };
  }, [template, itemStates]);

  // Validate before submit
  const validate = useCallback((): ValidationResult => {
    if (!template) return { isValid: false, error: 'Template not loaded' };

    const { sections } = template.checklist_json;

    // Check 1: Completion rate (95%)
    const minRequired = Math.ceil(completionStats.total * 0.95);
    if (completionStats.answered < minRequired) {
      // Find first unanswered item
      for (const section of sections) {
        for (const item of section.items) {
          const state = itemStates.get(item.id);
          if (!state?.response) {
            return {
              isValid: false,
              error: `Audit incomplete. You must answer at least 95% of items before submitting. Currently at ${completionStats.percentage}%.`,
              scrollToItemId: item.id,
            };
          }
        }
      }
    }

    // Check 2: Evidence requirements
    let missingEvidenceCount = 0;
    let firstMissingEvidenceItem: string | undefined;
    
    for (const section of sections) {
      for (const item of section.items) {
        const state = itemStates.get(item.id);
        const totalEvidence = (state?.evidenceFiles.length || 0) + (state?.evidenceUrls.length || 0);
        
        if (item.evidence_required === 'required_1' && totalEvidence < 1) {
          missingEvidenceCount++;
          if (!firstMissingEvidenceItem) firstMissingEvidenceItem = item.id;
        } else if (item.evidence_required === 'required_2' && totalEvidence < 2) {
          missingEvidenceCount++;
          if (!firstMissingEvidenceItem) firstMissingEvidenceItem = item.id;
        }
      }
    }

    if (missingEvidenceCount > 0) {
      return {
        isValid: false,
        error: `Missing required evidence on ${missingEvidenceCount} item(s).`,
        scrollToItemId: firstMissingEvidenceItem,
      };
    }

    // Check 3: Critical items
    let unansweredCriticalCount = 0;
    let firstUnansweredCritical: string | undefined;
    
    for (const section of sections) {
      for (const item of section.items) {
        if (item.critical) {
          const state = itemStates.get(item.id);
          if (!state?.response) {
            unansweredCriticalCount++;
            if (!firstUnansweredCritical) firstUnansweredCritical = item.id;
          }
        }
      }
    }

    if (unansweredCriticalCount > 0) {
      return {
        isValid: false,
        error: `Critical items cannot be skipped. ${unansweredCriticalCount} critical item(s) unanswered.`,
        scrollToItemId: firstUnansweredCritical,
      };
    }

    return { isValid: true };
  }, [template, itemStates, completionStats]);

  // Determine finding severity
  const determineSeverity = useCallback((
    item: TemplateItem,
    section: TemplateSection
  ): FindingSeverity => {
    if (item.critical) return 'critical';
    if (section.weight >= 25) return 'high';
    return 'medium';
  }, []);

  const isFailedForFinding = useCallback((item: TemplateItem, response: AuditItemResponse | null): boolean => {
    if (!response) return false;
    const value = response.value;

    if (item.type === 'pass_fail') return value === 'fail';
    if (item.type === 'rating' && typeof value === 'number') return value <= 2;

    if (item.type === 'checklist' && typeof value === 'object' && value !== null) {
      return Object.values(value as Record<string, boolean>).some(v => !v);
    }

    return false;
  }, []);

  const generateFindingCode = useCallback((): string => {
    const y = new Date().getFullYear();
    return `FND-${y}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }, []);

  // Save draft
  const saveDraft = useCallback(async () => {
    if (!template || !audit) return;

    setIsSaving(true);
    try {
      const statesMap = await flushEvidenceUploads(audit.id, template);
      const results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[] = [];

      for (const section of template.checklist_json.sections) {
        for (const item of section.items) {
          const state = statesMap.get(item.id);
          if (state?.response) {
            results.push({
              audit_id: audit.id,
              section_id: section.id,
              item_id: item.id,
              response: state.response,
              evidence_urls: state.evidencePaths,
              manual_finding: state.manualFinding?.trim() ? state.manualFinding : null,
              points_earned: calculateItemPoints(item, state),
            });
          }
        }
      }

      await upsertAuditResults(results);
    } finally {
      setIsSaving(false);
    }
  }, [audit, template, calculateItemPoints, flushEvidenceUploads]);

  // Submit audit
  const submitAudit = useCallback(async (): Promise<{ 
    success: boolean; 
    error?: string; 
    scrollToItemId?: string;
    findingsCount?: number;
    capaCount?: number;
  }> => {
    if (!template || !audit) {
      return { success: false, error: 'Audit or template not loaded' };
    }

    // Validate first
    const validation = validate();
    if (!validation.isValid) {
      return { 
        success: false, 
        error: validation.error, 
        scrollToItemId: validation.scrollToItemId 
      };
    }

    setIsSubmitting(true);
    try {
      const { sections } = template.checklist_json;

      const entityManagerId =
        (await getEntityManagerId(audit.entity_type, audit.entity_id)) ??
        (getAssigneeForCAPA(audit.entity_type, audit.entity_id) ?? null);

      const templateIsMaintenance = (template.name || '').toLowerCase().includes('maintenance');

      const statesMap = await flushEvidenceUploads(audit.id, template);

      // Step 1 & 2: Save all results
      const results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[] = [];

      for (const section of sections) {
        for (const item of section.items) {
          const state = statesMap.get(item.id);
          if (state?.response) {
            results.push({
              audit_id: audit.id,
              section_id: section.id,
              item_id: item.id,
              response: state.response,
              evidence_urls: state.evidencePaths,
              manual_finding: state.manualFinding?.trim() ? state.manualFinding : null,
              points_earned: calculateItemPoints(item, state),
            });
          }
        }
      }

      await upsertAuditResults(results);

      // Generate & persist findings
      const findingsToInsert: Array<{
        id: string;
        finding_code: string;
        audit_id: string;
        item_id: string;
        section_name: string;
        category: string;
        severity: FindingSeverity;
        description: string;
        evidence_urls: string[];
        status: 'open';
      }> = [];

      const findingByItemId = new Map<string, { findingId: string; severity: FindingSeverity; findingCode: string }>();
      const deptSlugByFindingId = new Map<string, 'maintenance' | 'quality'>();

      const isMaintenanceRelated = (sectionName: string, itemText: string, manualNote: string | undefined): boolean => {
        const haystack = `${sectionName} ${itemText} ${manualNote ?? ''}`.toLowerCase();
        const keywords = [
          'maintenance',
          'facility',
          'well-maintained',
          'equipment',
          'refriger',
          'freezer',
          'cold display',
          'hvac',
          'air condition',
          'ac ',
          'ventilation',
          'hood',
          'electri',
          'power',
          'light',
          'plumb',
          'leak',
          'drain',
          'water',
          'broken',
          'repair',
        ];
        return keywords.some(k => haystack.includes(k));
      };

      const [maintenanceDeptId, qualityDeptId] = await Promise.all([
        getDepartmentId('maintenance').catch(() => null),
        getDepartmentId('quality').catch(() => null),
      ]);

      if (!qualityDeptId) {
        throw new Error('Quality department is not configured. Run the departments migration/seed so CAPAs can be routed.');
      }

      for (const section of sections) {
        for (const item of section.items) {
          const state = statesMap.get(item.id);
          const response = state?.response ?? null;
          const hasManualNote = !!state?.manualFinding?.trim();
          const isFailed = isFailedForFinding(item, response);
          const evidencePaths = state?.evidencePaths ?? [];

          if (!isFailed && !hasManualNote) continue;

          const deptSlug: 'maintenance' | 'quality' = templateIsMaintenance
            ? 'maintenance'
            : isMaintenanceRelated(section.name, item.text, state?.manualFinding)
              ? 'maintenance'
              : 'quality';

          const severity = determineSeverity(item, section);
          
          // Professional Auditor Phrasing
          const findingDescription = hasManualNote
            ? `Observation: ${state!.manualFinding.trim()}`
            : `Observation: Non-compliance identified regarding "${item.text}"`;
          
          // Assertive CAPA Phrasing
          const generateAssertiveAction = (text: string): string => {
            const cleanText = text.toLowerCase().replace(/\?$/, '').replace(/^are |^is |^do |^does /, '');
            if (cleanText.includes('clean')) return `Ensure ${cleanText} and sanitized according to standard operating procedures.`;
            if (cleanText.includes('maintain') || cleanText.includes('repair')) return `Immediate maintenance/repair required for ${cleanText}.`;
            if (cleanText.includes('record') || cleanText.includes('log')) return `Update and verify all ${cleanText} for accuracy and compliance.`;
            if (cleanText.includes('training') || cleanText.includes('certif')) return `Conduct mandatory retraining and update ${cleanText} records.`;
            if (cleanText.includes('stock') || cleanText.includes('availab')) return `Replenish ${cleanText} and establish minimum stock level monitoring.`;
            return `Take immediate corrective action to ensure "${text}" meets compliance standards.`;
          };

          const capaDescription = hasManualNote
            ? `Corrective Action Required: ${state!.manualFinding.trim()}`
            : generateAssertiveAction(item.text);

          findingsToInsert.push({
            id: (() => {
              const id = crypto.randomUUID();
              const findingCode = generateFindingCode();
              findingByItemId.set(item.id, { findingId: id, severity, findingCode });
              deptSlugByFindingId.set(id, deptSlug);
              return id;
            })(),
            finding_code: findingByItemId.get(item.id)!.findingCode,
            audit_id: audit.id,
            item_id: item.id,
            section_name: section.name,
            category: section.name,
            severity,
            description: findingDescription,
            evidence_urls: evidencePaths,
            status: 'open',
          });

          // Store CAPA description to be used in next step
          (findingsToInsert[findingsToInsert.length - 1] as any)._capaDescription = capaDescription;
        }
      }

      await insertFindings(findingsToInsert);

      const capasToInsert = findingsToInsert.map(f => {
        const state = statesMap.get(f.item_id);
        const effectivePriority = (state?.capaPriority ?? f.severity) as CAPAPriority;
        const assignedTo = entityManagerId ?? undefined;
        const dueDate = state?.capaDueDate ?? calculateDueDate(effectivePriority as any);
        const deptSlug = deptSlugByFindingId.get(f.id) ?? 'quality';
        if (deptSlug === 'maintenance' && !maintenanceDeptId) {
          throw new Error('Maintenance department is not configured. Run the departments migration/seed so CAPAs can be routed to Maintenance.');
        }
        const deptId = deptSlug === 'maintenance' ? maintenanceDeptId : qualityDeptId;
        return {
          id: crypto.randomUUID(),
          capa_code: `CPA-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
          finding_id: f.id,
          audit_id: audit.id,
          department_id: deptId,
          entity_type: audit.entity_type,
          entity_id: audit.entity_id,
          description: (f as any)._capaDescription || f.description,
          assigned_to: assignedTo,
          due_date: dueDate,
          status: 'open' as const,
          priority: effectivePriority as any,
          evidence_urls: [],
          notes: undefined,
          sub_tasks: [],
        };
      });

      await insertCAPAs(capasToInsert);

      // Update audit status only after findings/CAPAs are persisted
      await updateAudit(audit.id, {
        status: 'pending_verification',
        completed_at: new Date().toISOString(),
        score: scoreResult.totalScore,
        pass_fail: scoreResult.passFail,
      });

      // Invalidate dashboard queries so lists and counts update immediately
      await queryClient.invalidateQueries({ queryKey: ['audits'] });

      // Notifications (in-app)
      try {
        const hoqPrimary = await fetchUserIdsByRole('head_of_quality');
        const hoqLegacy = hoqPrimary.length ? [] : await fetchUserIdsByRole('audit_manager');
        const hoqUserIds = Array.from(new Set([...hoqPrimary, ...hoqLegacy]));
        const maintenanceCount = findingsToInsert.filter(f => (deptSlugByFindingId.get(f.id) ?? 'quality') === 'maintenance').length;
        const maintenanceUserIds = maintenanceCount > 0
          ? await fetchDepartmentUserIds('maintenance').catch(() => [] as string[])
          : [];
        const auditMsg = `Audit submitted\nAudit ${audit.audit_code} has been submitted and is pending verification.`;
        const capaMsg = `CAPA created\n${capasToInsert.length} CAPA item(s) were generated for audit ${audit.audit_code}.`;
        const maintenanceMsg = `Maintenance issues detected\nAudit ${audit.audit_code} contains ${maintenanceCount} maintenance-related finding(s). Please review related CAPA(s).`;

        const rows = [
          ...hoqUserIds.map((uid) => ({
            user_id: uid,
            type: 'audit_submitted',
            message: auditMsg,
            link_to: `/audits/${audit.id}/verify`,
          })),
          ...maintenanceUserIds.map((uid) => ({
            user_id: uid,
            type: 'maintenance_issues',
            message: maintenanceMsg,
            link_to: `/capa`,
          })),
          ...(entityManagerId ? [{
            user_id: entityManagerId,
            type: 'capa_assigned',
            message: capaMsg,
            link_to: `/capa`,
          }] : []),
          ...capasToInsert
            .map((c) => c.assigned_to)
            .filter((uid): uid is string => !!uid)
            .map((uid) => ({
              user_id: uid,
              type: 'capa_assigned',
              message: capaMsg,
              link_to: `/capa`,
            })),
        ];

        // De-dupe by user_id + type + link
        const keySet = new Set<string>();
        const deduped = rows.filter((r) => {
          const key = `${r.user_id}:${r.type}:${r.link_to ?? ''}:${r.message}`;
          if (keySet.has(key)) return false;
          keySet.add(key);
          return true;
        });

        await insertNotifications(deduped);
      } catch (e) {
        // Notifications should not block audit submission
        console.error('Failed to create notifications for submission', e);
      }

      setSubmittedFindings(findingsToInsert);
      setSubmittedCAPAs(capasToInsert as any);

      await queryClient.invalidateQueries({ queryKey: ['audits'] });

      setAudit(prev => prev ? {
        ...prev,
        status: 'pending_verification',
        completed_at: new Date().toISOString(),
        score: scoreResult.totalScore,
        pass_fail: scoreResult.passFail,
      } : null);

      return { 
        success: true, 
        findingsCount: findingsToInsert.length,
        capaCount: capasToInsert.length,
      };
    } catch (e: any) {
      const details = [e?.message, e?.details, e?.hint].filter(Boolean).join(' - ');
      return {
        success: false,
        error: details || 'Submission failed',
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [audit, template, itemStates, validate, scoreResult, calculateItemPoints, determineSeverity, flushEvidenceUploads, queryClient, isFailedForFinding, generateFindingCode]);

  // Check if audit is read-only
  const isReadOnly = useMemo(() => {
    if (!audit) return true;
    return ['submitted', 'approved', 'rejected', 'pending_verification', 'cancelled'].includes(audit.status);
  }, [audit]);

  useEffect(() => {
    if (!audit || !template) return;
    if (isReadOnly) return;
    if (isSaving) return;

    const signature = buildDraftSignature(itemStates);
    if (signature === lastSavedSignatureRef.current) return;

    const handle = window.setTimeout(() => {
      void saveDraft()
        .then(() => {
          lastSavedSignatureRef.current = signature;
        })
        .catch((e) => {
          console.error('Auto-save draft failed', e);
        });
    }, 1200);

    return () => window.clearTimeout(handle);
  }, [audit, template, itemStates, isReadOnly, isSaving, saveDraft]);

  return {
    audit,
    template,
    itemStates,
    isLoading,
    isSaving,
    isSubmitting,
    scoreResult,
    completionStats,
    isReadOnly,
    submittedFindings,
    submittedCAPAs,
    updateItemResponse,
    addEvidenceFile,
    removeEvidenceFile,
    removeEvidenceUrl,
    updateManualFinding,
    updateItemCAPAPriority,
    updateItemCAPADueDate,
    saveDraft,
    submitAudit,
    validate,
  };
}
