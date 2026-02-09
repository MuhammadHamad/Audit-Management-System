import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, GripVertical, Trash2, CheckCircle, Star, Hash, Camera, MessageSquare, List, AlertTriangle, Paperclip, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditTemplate,
  TemplateSection,
  TemplateItem,
  EntityType,
  ChecklistJson,
  ScoringConfig,
} from '@/lib/templateStorage';
import {
  createTemplate as createTemplateSupabase,
  fetchTemplateById,
  updateTemplate as updateTemplateSupabase,
} from '@/lib/templateSupabase';

const ITEM_TYPE_OPTIONS = [
  { value: 'pass_fail', label: 'Pass/Fail', icon: CheckCircle },
  { value: 'rating', label: 'Rating 1-5', icon: Star },
  { value: 'numeric', label: 'Numeric', icon: Hash },
  { value: 'photo', label: 'Photo', icon: Camera },
  { value: 'text', label: 'Text Response', icon: MessageSquare },
  { value: 'checklist', label: 'Checklist', icon: List },
] as const;

const EVIDENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'optional', label: 'Optional' },
  { value: 'required_1', label: 'Required (1 photo)' },
  { value: 'required_2', label: 'Required (2 photos)' },
] as const;

const createDefaultItem = (order: number): TemplateItem => ({
  id: crypto.randomUUID(),
  text: '',
  type: 'pass_fail',
  points: 5,
  evidence_required: 'none',
  critical: false,
  help_text: '',
  order,
});

const createDefaultSection = (order: number): TemplateSection => ({
  id: crypto.randomUUID(),
  name: 'New Section',
  weight: 10,
  order,
  items: [createDefaultItem(1)],
});

export default function TemplateBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isEditMode = !!id;
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [entityType, setEntityType] = useState<EntityType | ''>('');
  const [passThreshold, setPassThreshold] = useState(70);
  const [criticalFailRule, setCriticalFailRule] = useState(true);
  const [weightedScoring, setWeightedScoring] = useState(true);
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [originalTemplate, setOriginalTemplate] = useState<AuditTemplate | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // UI state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedItemSectionId, setDraggedItemSectionId] = useState<string | null>(null);

  const templateQuery = useQuery({
    queryKey: ['template', id],
    queryFn: async () => {
      if (!id) return null;
      return fetchTemplateById(id);
    },
    enabled: isEditMode && !!id,
    placeholderData: () => {
      if (!id) return null;
      const cached = queryClient.getQueryData<AuditTemplate[]>(['templates']);
      return cached?.find(t => t.id === id);
    },
  });

  // Load template on edit
  useEffect(() => {
    if (!isEditMode || !id) return;
    if (!templateQuery.isSuccess) return;

    const template = templateQuery.data;
    if (!template) {
      toast.error('Template not found');
      navigate('/templates');
      return;
    }

    setOriginalTemplate(template);
    setName(template.name);
    setCode(template.code);
    setEntityType(template.entity_type);
    setPassThreshold(template.scoring_config.pass_threshold);
    setCriticalFailRule(template.scoring_config.critical_fail_rule);
    setWeightedScoring(template.scoring_config.weighted);
    setSections(template.checklist_json.sections);
    setExpandedSections(new Set(template.checklist_json.sections.map(s => s.id)));
  }, [id, isEditMode, navigate, templateQuery.data, templateQuery.isSuccess]);

  // Track unsaved changes
  useEffect(() => {
    if (!isEditMode) {
      setHasUnsavedChanges(name !== '' || code !== '' || entityType !== '' || sections.length > 0);
    } else if (originalTemplate) {
      const hasChanges =
        name !== originalTemplate.name ||
        passThreshold !== originalTemplate.scoring_config.pass_threshold ||
        criticalFailRule !== originalTemplate.scoring_config.critical_fail_rule ||
        weightedScoring !== originalTemplate.scoring_config.weighted ||
        JSON.stringify(sections) !== JSON.stringify(originalTemplate.checklist_json.sections);
      setHasUnsavedChanges(hasChanges);
    }
  }, [name, code, entityType, passThreshold, criticalFailRule, weightedScoring, sections, isEditMode, originalTemplate]);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges) {
      setPendingNavigation('/templates');
      setLeaveDialogOpen(true);
    } else {
      navigate('/templates');
    }
  }, [hasUnsavedChanges, navigate]);

  const handleLeaveConfirm = () => {
    setLeaveDialogOpen(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  };

  // Validation
  const validateForPublish = (): string | null => {
    if (!name.trim()) return 'Template name is required.';
    if (!code.trim()) return 'Template code is required.';
    if (!entityType) return 'Entity type is required.';
    if (sections.length === 0) return 'Add at least one section before publishing.';

    for (const section of sections) {
      if (section.items.length === 0) {
        return `Section "${section.name}" must have at least one item.`;
      }
      for (const item of section.items) {
        if (!item.text.trim()) {
          return `All items must have text. Check section "${section.name}".`;
        }
      }
    }

    const totalWeight = sections.reduce((acc, s) => acc + s.weight, 0);
    if (totalWeight !== 100) {
      return `Section weights must add up to 100%. Current total: ${totalWeight}%.`;
    }

    return null;
  };

  const validateCode = (): boolean => {
    if (!code.trim()) return true;
    return true;
  };

  const friendlyTemplateError = (error: unknown): string => {
    const anyErr = error as any;
    const msg = String(anyErr?.message ?? anyErr?.error_description ?? anyErr?.error ?? '');
    const code = String(anyErr?.code ?? '');
    if (code === '23505' || msg.toLowerCase().includes('duplicate')) {
      return 'Template code already exists.';
    }
    return 'Something went wrong. Please try again.';
  };

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      code: string;
      entity_type: EntityType;
      version: number;
      status: 'draft' | 'active' | 'archived';
      checklist_json: ChecklistJson;
      scoring_config: ScoringConfig;
      created_by: string | null;
    }) => createTemplateSupabase(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      updates: {
        name?: string;
        version?: number;
        status?: 'draft' | 'active' | 'archived';
        checklist_json?: ChecklistJson;
        scoring_config?: ScoringConfig;
      };
    }) => updateTemplateSupabase(payload.id, payload.updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (id) {
        await queryClient.invalidateQueries({ queryKey: ['template', id] });
      }
    },
  });

  const handleSaveDraft = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name.');
      return;
    }
    if (!code.trim()) {
      toast.error('Please enter a template code.');
      return;
    }
    if (!entityType) {
      toast.error('Please select an entity type.');
      return;
    }
    if (!validateCode()) {
      toast.error('Template code already exists.');
      return;
    }

    const checklistJson: ChecklistJson = { sections };
    const scoringConfig: ScoringConfig = {
      pass_threshold: passThreshold,
      critical_fail_rule: criticalFailRule,
      weighted: weightedScoring,
    };

    try {
      if (isEditMode && id) {
        const updated = await updateMutation.mutateAsync({
          id,
          updates: {
            name,
            checklist_json: checklistJson,
            scoring_config: scoringConfig,
          },
        });
        toast.success('Draft saved successfully.');
        setHasUnsavedChanges(false);
        setOriginalTemplate(updated);
      } else {
        const created = await createMutation.mutateAsync({
          name,
          code: code.toUpperCase(),
          entity_type: entityType as EntityType,
          version: 1,
          status: 'draft',
          checklist_json: checklistJson,
          scoring_config: scoringConfig,
          created_by: user?.id ?? null,
        });
        toast.success('Template saved as draft.');
        navigate(`/templates/${created.id}/edit`);
      }
    } catch (e) {
      toast.error(friendlyTemplateError(e));
    }
  };

  const handlePublish = async () => {
    const error = validateForPublish();
    if (error) {
      toast.error(error);
      return;
    }
    if (!validateCode()) {
      toast.error('Template code already exists.');
      return;
    }

    const checklistJson: ChecklistJson = { sections };
    const scoringConfig: ScoringConfig = {
      pass_threshold: passThreshold,
      critical_fail_rule: criticalFailRule,
      weighted: weightedScoring,
    };

    try {
      if (isEditMode && id) {
        const newVersion = originalTemplate?.status === 'active'
          ? (originalTemplate.version + 1)
          : originalTemplate?.version || 1;

        await updateMutation.mutateAsync({
          id,
          updates: {
            name,
            version: newVersion,
            status: 'active',
            checklist_json: checklistJson,
            scoring_config: scoringConfig,
          },
        });
        toast.success('Template published successfully.');
        setHasUnsavedChanges(false);
        navigate('/templates');
      } else {
        await createMutation.mutateAsync({
          name,
          code: code.toUpperCase(),
          entity_type: entityType as EntityType,
          version: 1,
          status: 'active',
          checklist_json: checklistJson,
          scoring_config: scoringConfig,
          created_by: user?.id ?? null,
        });
        toast.success('Template published successfully.');
        navigate('/templates');
      }
    } catch (e) {
      toast.error(friendlyTemplateError(e));
    }
  };

  // Section management
  const addSection = () => {
    const newSection = createDefaultSection(sections.length + 1);
    setSections([...sections, newSection]);
    setExpandedSections(prev => new Set([...prev, newSection.id]));
  };

  const updateSection = (sectionId: string, updates: Partial<TemplateSection>) => {
    setSections(prev =>
      prev.map(s => (s.id === sectionId ? { ...s, ...updates } : s))
    );
  };

  const deleteSection = (sectionId: string) => {
    if (sections.length <= 1) {
      toast.error('Template must have at least one section.');
      return;
    }
    setSections(prev => prev.filter(s => s.id !== sectionId).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Item management
  const addItem = (sectionId: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id === sectionId) {
          const newItem = createDefaultItem(s.items.length + 1);
          return { ...s, items: [...s.items, newItem] };
        }
        return s;
      })
    );
  };

  const updateItem = (sectionId: string, itemId: string, updates: Partial<TemplateItem>) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id === sectionId) {
          return {
            ...s,
            items: s.items.map(item => {
              if (item.id === itemId) {
                // Auto-set evidence if type is photo
                const newItem = { ...item, ...updates };
                if (updates.type === 'photo' && newItem.evidence_required === 'none') {
                  newItem.evidence_required = 'required_1';
                }
                return newItem;
              }
              return item;
            }),
          };
        }
        return s;
      })
    );
  };

  const deleteItem = (sectionId: string, itemId: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id === sectionId) {
          if (s.items.length <= 1) {
            toast.error('A section must have at least one item.');
            return s;
          }
          return {
            ...s,
            items: s.items.filter(item => item.id !== itemId).map((item, i) => ({ ...item, order: i + 1 })),
          };
        }
        return s;
      })
    );
  };

  // Drag and drop for sections
  const handleSectionDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSectionId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSectionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();
    if (!draggedSectionId || draggedSectionId === targetSectionId) return;

    setSections(prev => {
      const newSections = [...prev];
      const draggedIndex = newSections.findIndex(s => s.id === draggedSectionId);
      const targetIndex = newSections.findIndex(s => s.id === targetSectionId);
      const [draggedSection] = newSections.splice(draggedIndex, 1);
      newSections.splice(targetIndex, 0, draggedSection);
      return newSections.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setDraggedSectionId(null);
  };

  // Drag and drop for items
  const handleItemDragStart = (e: React.DragEvent, sectionId: string, itemId: string) => {
    setDraggedItemId(itemId);
    setDraggedItemSectionId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleItemDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleItemDrop = (e: React.DragEvent, targetSectionId: string, targetItemId: string) => {
    e.preventDefault();
    if (!draggedItemId || !draggedItemSectionId) return;
    if (draggedItemSectionId !== targetSectionId) return; // Only allow reorder within same section
    if (draggedItemId === targetItemId) return;

    setSections(prev =>
      prev.map(s => {
        if (s.id === targetSectionId) {
          const newItems = [...s.items];
          const draggedIndex = newItems.findIndex(i => i.id === draggedItemId);
          const targetIndex = newItems.findIndex(i => i.id === targetItemId);
          const [draggedItem] = newItems.splice(draggedIndex, 1);
          newItems.splice(targetIndex, 0, draggedItem);
          return { ...s, items: newItems.map((item, i) => ({ ...item, order: i + 1 })) };
        }
        return s;
      })
    );
    setDraggedItemId(null);
    setDraggedItemSectionId(null);
  };

  // Preview calculations
  const totalItems = useMemo(() => {
    return sections.reduce((acc, s) => acc + s.items.length, 0);
  }, [sections]);

  const estimatedTime = useMemo(() => {
    let minutes = 0;
    for (const section of sections) {
      for (const item of section.items) {
        if (item.type === 'pass_fail') {
          minutes += 1;
        } else if (['rating', 'numeric', 'text'].includes(item.type)) {
          minutes += 2;
        } else if (['photo', 'checklist'].includes(item.type)) {
          minutes += 3;
        }
      }
    }
    return minutes;
  }, [sections]);

  const canPublish = sections.length > 0 && sections.every(s => s.items.length > 0);

  const getItemTypeLabel = (type: string) => {
    const option = ITEM_TYPE_OPTIONS.find(o => o.value === type);
    return option?.label || type;
  };

  const getEvidenceLabel = (evidence: string) => {
    if (evidence === 'none') return null;
    const option = EVIDENCE_OPTIONS.find(o => o.value === evidence);
    return option?.label || evidence;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Templates
          </Button>
          {isEditMode ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template Name"
              className="w-64 text-lg font-semibold"
            />
          ) : (
            <h1 className="text-lg font-semibold">New Template</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <Button 
            onClick={handlePublish} 
            disabled={!canPublish}
            title={!canPublish ? 'Add at least one section with items before publishing.' : ''}
          >
            Publish
          </Button>
        </div>
      </div>

      {/* Active template warning */}
      {isEditMode && originalTemplate?.status === 'active' && (
        <Alert className="mx-6 mt-4 border-blue-200 bg-blue-50">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            You are editing an active template. Changes will create version {(originalTemplate.version + 1)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Builder */}
        <div className="w-80 flex-shrink-0 overflow-y-auto border-r bg-background p-4">
          {/* Metadata */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Template Settings</h3>
            
            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Branch Daily Hygiene"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="entity-type">Entity Type</Label>
              <Select
                value={entityType}
                onValueChange={(v) => setEntityType(v as EntityType)}
                disabled={isEditMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">Branch</SelectItem>
                  <SelectItem value="bck">BCK</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Template Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. TPL-BR-DAILY"
                disabled={isEditMode}
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Pass Threshold</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="threshold"
                  type="number"
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(Number(e.target.value))}
                  min={0}
                  max={100}
                  className="w-20"
                />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="critical-rule" className="flex-1 pr-2">
                Fail if any critical item fails
              </Label>
              <Switch
                id="critical-rule"
                checked={criticalFailRule}
                onCheckedChange={setCriticalFailRule}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="weighted" className="flex-1 pr-2">
                Use section weights
              </Label>
              <Switch
                id="weighted"
                checked={weightedScoring}
                onCheckedChange={setWeightedScoring}
              />
            </div>
          </div>

          <Separator className="my-6" />

          {/* Sections */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Sections</h3>

            <div className="space-y-3">
              {sections.map((section) => (
                <Collapsible
                  key={section.id}
                  open={expandedSections.has(section.id)}
                  onOpenChange={() => toggleSection(section.id)}
                >
                  <div
                    className="rounded-lg border bg-card"
                    draggable
                    onDragStart={(e) => handleSectionDragStart(e, section.id)}
                    onDragOver={handleSectionDragOver}
                    onDrop={(e) => handleSectionDrop(e, section.id)}
                  >
                    {/* Section Header */}
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <Input
                            value={section.name}
                            onChange={(e) => updateSection(section.id, { name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 text-sm font-medium"
                          />
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="number"
                            value={section.weight}
                            onChange={(e) => updateSection(section.id, { weight: Number(e.target.value) })}
                            className="h-8 w-14 text-center text-sm"
                            min={0}
                            max={100}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        {sections.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSection(section.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CollapsibleTrigger>

                    {/* Section Items */}
                    <CollapsibleContent>
                      <div className="border-t px-3 pb-3 pt-2 space-y-2">
                        {section.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded border bg-muted/30 p-3 space-y-3"
                            draggable
                            onDragStart={(e) => handleItemDragStart(e, section.id, item.id)}
                            onDragOver={handleItemDragOver}
                            onDrop={(e) => handleItemDrop(e, section.id, item.id)}
                          >
                            {/* Item header */}
                            <div className="flex items-start gap-2">
                              <GripVertical className="h-4 w-4 mt-2.5 text-muted-foreground cursor-grab flex-shrink-0" />
                              <div className="flex-1 space-y-2">
                                <Input
                                  value={item.text}
                                  onChange={(e) => updateItem(section.id, item.id, { text: e.target.value })}
                                  placeholder="e.g. Are all floors clean and dry?"
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                                onClick={() => deleteItem(section.id, item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Item fields */}
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div>
                                <Label className="text-xs">Type</Label>
                                <Select
                                  value={item.type}
                                  onValueChange={(v) => updateItem(section.id, item.id, { type: v as TemplateItem['type'] })}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ITEM_TYPE_OPTIONS.map(option => (
                                      <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                          <option.icon className="h-3 w-3" />
                                          {option.label}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Points</Label>
                                <Input
                                  type="number"
                                  value={item.points}
                                  onChange={(e) => updateItem(section.id, item.id, { points: Number(e.target.value) })}
                                  className="h-8 text-xs"
                                  min={1}
                                  max={100}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Evidence</Label>
                                <Select
                                  value={item.evidence_required}
                                  onValueChange={(v) => updateItem(section.id, item.id, { evidence_required: v as TemplateItem['evidence_required'] })}
                                  disabled={item.type === 'photo'}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EVIDENCE_OPTIONS.map(option => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-end">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`critical-${item.id}`}
                                    checked={item.critical}
                                    onCheckedChange={(v) => updateItem(section.id, item.id, { critical: v })}
                                  />
                                  <Label htmlFor={`critical-${item.id}`} className="text-xs">Critical</Label>
                                </div>
                              </div>
                            </div>

                            {/* Help text */}
                            <div className="pl-6">
                              <Label className="text-xs">Help Text</Label>
                              <Input
                                value={item.help_text}
                                onChange={(e) => updateItem(section.id, item.id, { help_text: e.target.value })}
                                placeholder="Guidance for auditors..."
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => addItem(section.id)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Item
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>

            <Button variant="outline" className="w-full" onClick={addSection}>
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
          <div className="mx-auto max-w-2xl">
            {/* Preview Header */}
            <div className="mb-6 rounded-lg border bg-background p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{name || 'Preview'}</h2>
                  {entityType && (
                    <Badge variant="secondary" className="mt-2">
                      {entityType.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="font-medium">{totalItems}</span> items
                  </div>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <Clock className="h-3 w-3" />
                    <span>~{estimatedTime} min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Body */}
            {sections.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-12 text-center">
                <p className="text-muted-foreground">
                  Your template preview will appear here as you add sections and items.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sections.map((section) => (
                  <div key={section.id} className="rounded-lg border bg-background">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <h3 className="font-semibold">{section.name || 'Untitled Section'}</h3>
                      <Badge variant="outline">{section.weight}%</Badge>
                    </div>
                    <div className="divide-y">
                      {section.items.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm">{item.text || 'No question text'}</p>
                              {item.help_text && (
                                <p className="text-xs text-muted-foreground mt-1">{item.help_text}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                              <Badge variant="secondary" className="text-xs">
                                {getItemTypeLabel(item.type)}
                              </Badge>
                              {item.critical && (
                                <Badge variant="destructive" className="text-xs">
                                  CRITICAL
                                </Badge>
                              )}
                              {getEvidenceLabel(item.evidence_required) && (
                                <Badge variant="outline" className="text-xs">
                                  <Paperclip className="h-3 w-3 mr-1" />
                                  {getEvidenceLabel(item.evidence_required)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leave confirmation dialog */}
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveConfirm}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
