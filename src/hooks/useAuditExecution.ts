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
  FindingSeverity,
  getAssigneeForCAPA,
  calculateDueDate,
} from '@/lib/auditExecutionStorage';
import { fetchAuditById, updateAudit } from '@/lib/auditSupabase';
import { 
  createSignedAuditEvidenceUrl,
  fetchAuditResults,
  fetchCAPAsByAuditId,
  fetchFindingsByAuditId,
  insertCAPAs,
  insertFindings,
  upsertAuditResults,
  uploadAuditEvidenceFile,
} from '@/lib/executionSupabase';

interface ItemState {
  response: AuditItemResponse | null;
  evidenceFiles: File[];
  evidenceUrls: string[];
  evidencePaths: string[];
  manualFinding: string;
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
  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSavedSignatureRef = useRef<string>('');
  const [submittedFindings, setSubmittedFindings] = useState<any[]>([]);
  const [submittedCAPAs, setSubmittedCAPAs] = useState<any[]>([]);

  const buildDraftSignature = (states: Map<string, ItemState>): string => {
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
        (s.evidenceFiles ?? []).map((f) => `${f.name}:${f.size}:${f.lastModified}`),
      ]);
    }
    return JSON.stringify(rows);
  };

  // Load audit, template, and existing results
  useEffect(() => {
    const loadAudit = async () => {
      setIsLoading(true);
      try {
        if (!auditId) return;

        const loadedAudit = await fetchAuditById(auditId);
        if (!loadedAudit) return;

        setAudit(loadedAudit);

        const loadedTemplate = await fetchTemplateById(loadedAudit.template_id);
        if (!loadedTemplate) return;

        setTemplate(loadedTemplate);

        // Load existing results
        const existingResults = await fetchAuditResults(auditId);
        const statesMap = new Map<string, ItemState>();

        // Initialize all items
        for (const section of loadedTemplate.checklist_json.sections) {
          for (const item of section.items) {
            const existingResult = existingResults.find(r => r.item_id === item.id);
            const evidencePaths = existingResult?.evidence_urls || [];
            const evidenceUrls = await Promise.all(
              evidencePaths.map((p) => createSignedAuditEvidenceUrl(p))
            );
            statesMap.set(item.id, {
              response: existingResult?.response || null,
              evidenceFiles: [],
              evidenceUrls,
              evidencePaths,
              manualFinding: '',
            });
          }
        }
        setItemStates(statesMap);
        lastSavedSignatureRef.current = buildDraftSignature(statesMap);

        // If audit is completed, findings/CAPA are not loaded here yet.
        if (['submitted', 'approved', 'rejected', 'pending_verification'].includes(loadedAudit.status)) {
          const [dbFindings, dbCapas] = await Promise.all([
            fetchFindingsByAuditId(loadedAudit.id),
            fetchCAPAsByAuditId(loadedAudit.id),
          ]);
          setSubmittedFindings(dbFindings);
          setSubmittedCAPAs(dbCapas);
        }

      } finally {
        setIsLoading(false);
      }
    };

    loadAudit();
  }, [auditId]);

  const markAuditInProgressIfNeeded = useCallback(() => {
    if (!auditId) return;
    if (!audit) return;
    if (audit.status !== 'scheduled') return;

    const startedAt = audit.started_at ?? new Date().toISOString();

    setAudit(prev => prev ? {
      ...prev,
      status: 'in_progress',
      started_at: startedAt,
    } : null);

    void updateAudit(auditId, {
      status: 'in_progress',
      started_at: startedAt,
    });
    void queryClient.invalidateQueries({ queryKey: ['audits'] });
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
      };
      newMap.set(itemId, { ...current, response });
      return newMap;
    });

    if (response?.value !== null) {
      markAuditInProgressIfNeeded();
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
      };
      newMap.set(itemId, { ...current, manualFinding: note });
      return newMap;
    });
  }, []);

  const flushEvidenceUploads = useCallback(async (auditIdForPaths: string, templateForItems: AuditTemplate) => {
    const nextMap = new Map(itemStates);

    for (const section of templateForItems.checklist_json.sections) {
      for (const item of section.items) {
        const current = nextMap.get(item.id);
        if (!current) continue;
        if (current.evidenceFiles.length === 0) continue;

        const uploaded = await Promise.all(
          current.evidenceFiles.map((file) => uploadAuditEvidenceFile(auditIdForPaths, item.id, file))
        );

        const newPaths = uploaded.map(u => u.path);
        const newSignedUrls = uploaded.map(u => u.signedUrl);

        nextMap.set(item.id, {
          ...current,
          evidenceFiles: [],
          evidencePaths: [...current.evidencePaths, ...newPaths],
          evidenceUrls: [...current.evidenceUrls, ...newSignedUrls],
        });
      }
    }

    setItemStates(nextMap);
    return nextMap;
  }, [itemStates]);

  // Calculate points for an item
  const calculateItemPoints = useCallback((
    item: TemplateItem,
    state: ItemState
  ): number => {
    if (!state.response) return 0;
    const value = state.response.value;

    switch (item.type) {
      case 'pass_fail':
        return value === 'pass' ? item.points : 0;
      
      case 'rating':
        if (typeof value === 'number') {
          return (value / 5) * item.points;
        }
        return 0;
      
      case 'numeric':
        return item.points; // Full points for any numeric value
      
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
              points_earned: calculateItemPoints(item, state),
            });
          }
        }
      }

      await upsertAuditResults(results);

      // Update audit status
      await updateAudit(audit.id, {
        status: 'pending_verification',
        completed_at: new Date().toISOString(),
        score: scoreResult.totalScore,
        pass_fail: scoreResult.passFail,
      });

      // Invalidate dashboard queries so Submitted count updates immediately
      await queryClient.invalidateQueries({ queryKey: ['audits'] });

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

      for (const section of sections) {
        for (const item of section.items) {
          const state = statesMap.get(item.id);
          const response = state?.response ?? null;
          const hasManualNote = !!state?.manualFinding?.trim();
          const isFailed = isFailedForFinding(item, response);
          const evidencePaths = state?.evidencePaths ?? [];

          if (!isFailed && !hasManualNote) continue;

          const severity = determineSeverity(item, section);
          const description = hasManualNote
            ? state!.manualFinding.trim()
            : `Non-conformance: ${item.text}`;

          findingsToInsert.push({
            id: (() => {
              const id = crypto.randomUUID();
              const findingCode = generateFindingCode();
              findingByItemId.set(item.id, { findingId: id, severity, findingCode });
              return id;
            })(),
            finding_code: findingByItemId.get(item.id)!.findingCode,
            audit_id: audit.id,
            item_id: item.id,
            section_name: section.name,
            category: section.name,
            severity,
            description,
            evidence_urls: evidencePaths,
            status: 'open',
          });
        }
      }

      await insertFindings(findingsToInsert);

      const capasToInsert = findingsToInsert.map(f => {
        const priority = f.severity;
        const assignedTo = getAssigneeForCAPA(audit.entity_type, audit.entity_id);
        const dueDate = calculateDueDate(f.severity);
        return {
          id: crypto.randomUUID(),
          capa_code: `CPA-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
          finding_id: f.id,
          audit_id: audit.id,
          entity_type: audit.entity_type,
          entity_id: audit.entity_id,
          description: f.description,
          assigned_to: assignedTo,
          due_date: dueDate,
          status: 'pending_verification' as const,
          priority: priority as any,
          evidence_urls: f.evidence_urls,
          notes: undefined,
          sub_tasks: [],
        };
      });

      await insertCAPAs(capasToInsert);

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
      return {
        success: false,
        error: e?.message || 'Submission failed',
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
    saveDraft,
    submitAudit,
    validate,
  };
}
