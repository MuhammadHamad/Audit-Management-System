import { useState, useCallback, useEffect, useMemo } from 'react';
import { Audit, updateAudit, getAuditById } from '@/lib/auditStorage';
import { 
  AuditTemplate, 
  TemplateSection, 
  TemplateItem, 
  getTemplateById 
} from '@/lib/templateStorage';
import {
  AuditResult,
  AuditItemResponse,
  Finding,
  CAPA,
  FindingSeverity,
  getAuditResultsByAuditId,
  saveAuditResult,
  saveBulkAuditResults,
  createFinding,
  createCAPA,
  createNotification,
  getAssigneeForCAPA,
  calculateDueDate,
  getFindingsByAuditId,
  getCAPAsByAuditId,
} from '@/lib/auditExecutionStorage';
import { getEntityName } from '@/lib/auditStorage';
import { getUsersByRole } from '@/lib/entityStorage';

interface ItemState {
  response: AuditItemResponse | null;
  evidenceFiles: File[];
  evidenceUrls: string[];
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
  const [audit, setAudit] = useState<Audit | null>(null);
  const [template, setTemplate] = useState<AuditTemplate | null>(null);
  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedFindings, setSubmittedFindings] = useState<Finding[]>([]);
  const [submittedCAPAs, setSubmittedCAPAs] = useState<CAPA[]>([]);

  // Load audit, template, and existing results
  useEffect(() => {
    const loadAudit = async () => {
      setIsLoading(true);
      try {
        const loadedAudit = getAuditById(auditId);
        if (!loadedAudit) return;

        setAudit(loadedAudit);

        const loadedTemplate = getTemplateById(loadedAudit.template_id);
        if (!loadedTemplate) return;

        setTemplate(loadedTemplate);

        // Load existing results
        const existingResults = getAuditResultsByAuditId(auditId);
        const statesMap = new Map<string, ItemState>();

        // Initialize all items
        for (const section of loadedTemplate.checklist_json.sections) {
          for (const item of section.items) {
            const existingResult = existingResults.find(r => r.item_id === item.id);
            statesMap.set(item.id, {
              response: existingResult?.response || null,
              evidenceFiles: [],
              evidenceUrls: existingResult?.evidence_urls || [],
              manualFinding: '',
            });
          }
        }
        setItemStates(statesMap);

        // If audit is completed, load findings and CAPAs
        if (['submitted', 'approved', 'rejected', 'pending_verification'].includes(loadedAudit.status)) {
          setSubmittedFindings(getFindingsByAuditId(auditId));
          setSubmittedCAPAs(getCAPAsByAuditId(auditId));
        }

        // Start the audit if it's still scheduled
        if (loadedAudit.status === 'scheduled') {
          updateAudit(auditId, {
            status: 'in_progress',
            started_at: new Date().toISOString(),
          });
          setAudit(prev => prev ? {
            ...prev,
            status: 'in_progress',
            started_at: new Date().toISOString(),
          } : null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadAudit();
  }, [auditId]);

  // Update item response
  const updateItemResponse = useCallback((itemId: string, response: AuditItemResponse) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
        manualFinding: '',
      };
      newMap.set(itemId, { ...current, response });
      return newMap;
    });
  }, []);

  // Add evidence file
  const addEvidenceFile = useCallback((itemId: string, file: File) => {
    setItemStates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId) || {
        response: null,
        evidenceFiles: [],
        evidenceUrls: [],
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
        manualFinding: '',
      };
      newMap.set(itemId, { ...current, manualFinding: note });
      return newMap;
    });
  }, []);

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

  // Save draft
  const saveDraft = useCallback(async () => {
    if (!template || !audit) return;

    setIsSaving(true);
    try {
      const results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[] = [];

      for (const section of template.checklist_json.sections) {
        for (const item of section.items) {
          const state = itemStates.get(item.id);
          if (state?.response) {
            results.push({
              audit_id: audit.id,
              section_id: section.id,
              item_id: item.id,
              response: state.response,
              evidence_urls: state.evidenceUrls,
              points_earned: calculateItemPoints(item, state),
            });
          }
        }
      }

      saveBulkAuditResults(results);
    } finally {
      setIsSaving(false);
    }
  }, [audit, template, itemStates, calculateItemPoints]);

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

      // Step 1 & 2: Save all results
      const results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[] = [];

      for (const section of sections) {
        for (const item of section.items) {
          const state = itemStates.get(item.id);
          if (state?.response) {
            results.push({
              audit_id: audit.id,
              section_id: section.id,
              item_id: item.id,
              response: state.response,
              evidence_urls: state.evidenceUrls, // In real app, upload files here
              points_earned: calculateItemPoints(item, state),
            });
          }
        }
      }

      saveBulkAuditResults(results);

      // Step 4: Generate findings
      const findings: Finding[] = [];
      
      for (const section of sections) {
        for (const item of section.items) {
          const state = itemStates.get(item.id);
          if (!state?.response) continue;
          
          const value = state.response.value;
          let shouldCreateFinding = false;
          let description = `Non-conformance detected: ${item.text}`;
          
          if (item.type === 'pass_fail' && value === 'fail') {
            shouldCreateFinding = true;
          } else if (item.type === 'rating' && typeof value === 'number' && value <= 2) {
            shouldCreateFinding = true;
            description = `Low rating (${value}/5): ${item.text}`;
          } else if (item.type === 'checklist' && item.critical && typeof value === 'object' && value !== null) {
            const hasUnchecked = Object.values(value as Record<string, boolean>).some(v => !v);
            if (hasUnchecked) {
              shouldCreateFinding = true;
              description = `Incomplete critical checklist: ${item.text}`;
            }
          }

          // Add manual finding note if present
          if (state.manualFinding && state.manualFinding.trim() !== '') {
            description += ` Additional notes: ${state.manualFinding}`;
            if (!shouldCreateFinding) {
              // Manual finding without auto-trigger
              shouldCreateFinding = true;
            }
          }

          if (shouldCreateFinding) {
            const severity = item.type === 'rating' && typeof value === 'number' && value === 2 
              ? 'low' 
              : determineSeverity(item, section);
            
            const finding = createFinding({
              audit_id: audit.id,
              item_id: item.id,
              section_name: section.name,
              category: item.type,
              severity,
              description,
              evidence_urls: state.evidenceUrls,
              status: 'open',
            });
            findings.push(finding);
          }
        }
      }

      // Step 5: Create CAPAs
      const capas: CAPA[] = [];
      const entityName = getEntityName(audit.entity_type, audit.entity_id);
      
      for (const finding of findings) {
        const assignee = getAssigneeForCAPA(audit.entity_type, audit.entity_id);
        const dueDate = calculateDueDate(finding.severity);
        
        const capa = createCAPA({
          finding_id: finding.id,
          audit_id: audit.id,
          entity_type: audit.entity_type,
          entity_id: audit.entity_id,
          description: finding.description,
          assigned_to: assignee || '',
          due_date: dueDate,
          status: 'open',
          priority: finding.severity,
          evidence_urls: [],
          sub_tasks: [],
        });
        capas.push(capa);

        // Step 6: Create notification for assignee
        if (assignee) {
          createNotification({
            user_id: assignee,
            type: 'capa',
            title: 'New CAPA assigned',
            message: `You have a new corrective action for ${entityName}. Due: ${dueDate}`,
            link_to: `/capa/${capa.id}`,
            read: false,
          });
        }

        // Notify audit manager for critical findings
        if (finding.severity === 'critical') {
          const auditManagers = getUsersByRole('audit_manager');
          for (const manager of auditManagers) {
            createNotification({
              user_id: manager.id,
              type: 'finding',
              title: 'Critical finding detected',
              message: `A critical issue was found during audit ${audit.audit_code} at ${entityName}.`,
              link_to: `/audits/${audit.id}`,
              read: false,
            });
          }
        }
      }

      // Step 1: Update audit status
      updateAudit(audit.id, {
        status: 'submitted',
        completed_at: new Date().toISOString(),
        score: scoreResult.totalScore,
        pass_fail: scoreResult.passFail,
      });

      setAudit(prev => prev ? {
        ...prev,
        status: 'submitted',
        completed_at: new Date().toISOString(),
        score: scoreResult.totalScore,
        pass_fail: scoreResult.passFail,
      } : null);

      setSubmittedFindings(findings);
      setSubmittedCAPAs(capas);

      return { 
        success: true, 
        findingsCount: findings.length,
        capaCount: capas.length,
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [audit, template, itemStates, validate, scoreResult, calculateItemPoints, determineSeverity]);

  // Check if audit is read-only
  const isReadOnly = useMemo(() => {
    if (!audit) return true;
    return ['submitted', 'approved', 'rejected', 'pending_verification', 'cancelled'].includes(audit.status);
  }, [audit]);

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
