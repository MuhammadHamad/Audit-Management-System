import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { AuditTemplate } from '@/lib/templateStorage';
import { useQuery } from '@tanstack/react-query';
import { fetchTemplates } from '@/lib/templateSupabase';
import { getBranches, getBCKs, getSuppliers, getUsersByRole } from '@/lib/entityStorage';
import type { AuditPlan } from '@/lib/auditStorage';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { createAuditPlanAndGenerateAudits, updateAuditPlan } from '@/lib/auditSupabase';

const formSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  entity_type: z.enum(['branch', 'bck', 'supplier']),
  template_id: z.string().min(1, 'Template is required'),
});

interface AuditPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: AuditPlan | null;
  onSuccess: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function AuditPlanModal({ open, onOpenChange, plan, onSuccess }: AuditPlanModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEditing = !!plan;

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    enabled: open,
  });

  // Schedule state
  const [scheduleType, setScheduleType] = useState<'one_time' | 'recurring'>('one_time');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Scope state
  const [scopeType, setScopeType] = useState<'all' | 'specific'>('all');
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [entitySearch, setEntitySearch] = useState('');

  // Assignment state
  const [assignmentStrategy, setAssignmentStrategy] = useState<'auto_round_robin' | 'assign_specific' | 'manual'>('auto_round_robin');
  const [assignedAuditorId, setAssignedAuditorId] = useState<string>('');

  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [entities, setEntities] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [auditors, setAuditors] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      entity_type: undefined,
      template_id: '',
    },
  });

  const watchEntityType = form.watch('entity_type');

  useEffect(() => {
    if (open) {
      // Load templates
      setTemplates(allTemplates.filter(t => t.status === 'active'));
      // Load auditors
      setAuditors(getUsersByRole('auditor'));

      if (plan) {
        // Populate form for editing
        form.reset({
          name: plan.name,
          description: plan.description || '',
          entity_type: plan.entity_type,
          template_id: plan.template_id,
        });

        // Populate schedule
        if (plan.recurrence_pattern.type === 'one_time') {
          setScheduleType('one_time');
          setScheduledDate(plan.recurrence_pattern.scheduled_date 
            ? new Date(plan.recurrence_pattern.scheduled_date) 
            : undefined);
        } else {
          setScheduleType('recurring');
          setFrequency(plan.recurrence_pattern.frequency || 'weekly');
          setDaysOfWeek(plan.recurrence_pattern.days_of_week || [1, 3, 5]);
          setDayOfMonth(plan.recurrence_pattern.day_of_month || 1);
          setStartDate(plan.recurrence_pattern.start_date 
            ? new Date(plan.recurrence_pattern.start_date) 
            : undefined);
          setEndDate(plan.recurrence_pattern.end_date 
            ? new Date(plan.recurrence_pattern.end_date) 
            : undefined);
        }

        // Populate scope
        setScopeType(plan.scope.type);
        setSelectedEntityIds(plan.scope.entity_ids || []);

        // Populate assignment
        setAssignmentStrategy(plan.assignment_strategy);
        setAssignedAuditorId(plan.assigned_auditor_id || '');
      } else {
        // Reset for new plan
        form.reset({
          name: '',
          description: '',
          entity_type: undefined,
          template_id: '',
        });
        setScheduleType('one_time');
        setScheduledDate(undefined);
        setFrequency('weekly');
        setDaysOfWeek([1, 3, 5]);
        setDayOfMonth(1);
        setStartDate(undefined);
        setEndDate(undefined);
        setScopeType('all');
        setSelectedEntityIds([]);
        setAssignmentStrategy('auto_round_robin');
        setAssignedAuditorId('');
      }
    }
  }, [open, plan, form, allTemplates]);

  // Update entities when entity type changes
  useEffect(() => {
    if (!watchEntityType) {
      setEntities([]);
      return;
    }

    let entityList: Array<{ id: string; code: string; name: string }> = [];
    if (watchEntityType === 'branch') {
      entityList = getBranches()
        .filter(b => b.status === 'active')
        .map(b => ({ id: b.id, code: b.code, name: b.name }));
    } else if (watchEntityType === 'bck') {
      entityList = getBCKs()
        .filter(b => b.status === 'active')
        .map(b => ({ id: b.id, code: b.code, name: b.name }));
    } else if (watchEntityType === 'supplier') {
      entityList = getSuppliers()
        .filter(s => s.status === 'active')
        .map(s => ({ id: s.id, code: s.supplier_code, name: s.name }));
    }
    setEntities(entityList);

    // Reset selected entities when entity type changes
    if (!isEditing) {
      setSelectedEntityIds([]);
    }
  }, [watchEntityType, isEditing]);

  // Filter templates based on entity type
  const filteredTemplates = templates.filter(t => 
    !watchEntityType || t.entity_type === watchEntityType
  );

  // Filter entities based on search
  const filteredEntities = entities.filter(e =>
    e.name.toLowerCase().includes(entitySearch.toLowerCase()) ||
    e.code.toLowerCase().includes(entitySearch.toLowerCase())
  );

  const toggleDayOfWeek = (day: number) => {
    if (daysOfWeek.includes(day)) {
      if (daysOfWeek.length > 1) {
        setDaysOfWeek(daysOfWeek.filter(d => d !== day));
      }
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort((a, b) => a - b));
    }
  };

  const toggleEntitySelection = (entityId: string) => {
    if (selectedEntityIds.includes(entityId)) {
      setSelectedEntityIds(selectedEntityIds.filter(id => id !== entityId));
    } else {
      setSelectedEntityIds([...selectedEntityIds, entityId]);
    }
  };

  const validateForm = (): boolean => {
    // Schedule validation
    if (scheduleType === 'one_time' && !scheduledDate) {
      toast({
        title: 'Validation Error',
        description: 'Please select a scheduled date.',
        variant: 'destructive',
      });
      return false;
    }

    if (scheduleType === 'recurring') {
      if (!startDate) {
        toast({
          title: 'Validation Error',
          description: 'Please select a start date.',
          variant: 'destructive',
        });
        return false;
      }
      if (endDate && startDate && endDate < startDate) {
        toast({
          title: 'Validation Error',
          description: 'End date must be after start date.',
          variant: 'destructive',
        });
        return false;
      }
    }

    // Scope validation
    if (scopeType === 'specific' && selectedEntityIds.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one entity.',
        variant: 'destructive',
      });
      return false;
    }

    // Assignment validation
    if (assignmentStrategy === 'assign_specific' && !assignedAuditorId) {
      toast({
        title: 'Validation Error',
        description: 'Please select an auditor.',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!validateForm() || !user) return;

    const recurrencePattern = scheduleType === 'one_time'
      ? {
          type: 'one_time' as const,
          scheduled_date: scheduledDate?.toISOString().split('T')[0],
          entity_ids: scopeType === 'specific' ? selectedEntityIds : [],
        }
      : {
          type: 'recurring' as const,
          frequency,
          days_of_week: frequency === 'weekly' ? daysOfWeek : undefined,
          day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
          start_date: startDate?.toISOString().split('T')[0],
          end_date: endDate?.toISOString().split('T')[0],
          entity_ids: scopeType === 'specific' ? selectedEntityIds : [],
        };

    const planData = {
      name: data.name,
      description: data.description,
      template_id: data.template_id,
      entity_type: data.entity_type,
      recurrence_pattern: recurrencePattern,
      scope: {
        type: scopeType,
        entity_ids: scopeType === 'specific' ? selectedEntityIds : undefined,
      },
      assignment_strategy: assignmentStrategy,
      assigned_auditor_id: assignmentStrategy === 'assign_specific' ? assignedAuditorId : undefined,
      status: 'active' as const,
      created_by: user.id,
    };

    try {
      if (isEditing && plan) {
        await updateAuditPlan(plan.id, planData);
        toast({
          title: 'Success',
          description: 'Audit plan updated successfully.',
        });
        onSuccess();
        onOpenChange(false);
      } else {
        const result = await createAuditPlanAndGenerateAudits(planData, { horizonDays: 30 });
        toast({
          title: 'Success',
          description: `Audit plan created. ${result.generatedAudits} audits scheduled.`,
        });
        onSuccess();
        onOpenChange(false);
        // Navigate to audits page
        navigate('/audits');
      }
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to save audit plan.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Audit Plan' : 'Create Audit Plan'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modify the audit plan settings.' 
              : 'Set up a new audit schedule for your entities.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Plan Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Monthly Branch Audits"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g. Monthly management audit for all Riyadh branches"
                {...form.register('description')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entity Type *</Label>
                <Select
                  value={form.watch('entity_type') || '__none__'}
                  onValueChange={(value) => form.setValue('entity_type', value === '__none__' ? undefined as any : value as any, { shouldValidate: true })}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Select type</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="bck">BCK</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Template *</Label>
                <Select
                  value={form.watch('template_id') || '__none__'}
                  onValueChange={(value) => form.setValue('template_id', value === '__none__' ? '' : value, { shouldValidate: true })}
                  disabled={isEditing || !watchEntityType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Select template</SelectItem>
                    {filteredTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Schedule */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Schedule</Label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={scheduleType === 'one_time' ? 'default' : 'outline'}
                className={scheduleType === 'one_time' ? 'bg-primary' : ''}
                onClick={() => setScheduleType('one_time')}
              >
                One-time
              </Button>
              <Button
                type="button"
                variant={scheduleType === 'recurring' ? 'default' : 'outline'}
                className={scheduleType === 'recurring' ? 'bg-primary' : ''}
                onClick={() => setScheduleType('recurring')}
              >
                Recurring
              </Button>
            </div>

            {scheduleType === 'one_time' && (
              <div className="space-y-2">
                <Label>Scheduled Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !scheduledDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {scheduleType === 'recurring' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {frequency === 'weekly' && (
                  <div className="space-y-2">
                    <Label>Days of Week</Label>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map(day => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={daysOfWeek.includes(day.value) ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'w-10',
                            daysOfWeek.includes(day.value) && 'bg-primary'
                          )}
                          onClick={() => toggleDayOfWeek(day.value)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {frequency === 'monthly' && (
                  <div className="space-y-2">
                    <Label>Day of Month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-24"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !startDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, 'PPP') : 'Start'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !endDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, 'PPP') : 'No end'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          disabled={(date) => startDate && date < startDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Scope */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Scope</Label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={scopeType === 'all' ? 'default' : 'outline'}
                className={scopeType === 'all' ? 'bg-primary' : ''}
                onClick={() => setScopeType('all')}
                disabled={!watchEntityType}
              >
                All {watchEntityType ? `${watchEntityType}s` : 'entities'}
              </Button>
              <Button
                type="button"
                variant={scopeType === 'specific' ? 'default' : 'outline'}
                className={scopeType === 'specific' ? 'bg-primary' : ''}
                onClick={() => setScopeType('specific')}
                disabled={!watchEntityType}
              >
                Specific {watchEntityType ? `${watchEntityType}s` : 'entities'}
              </Button>
            </div>

            {scopeType === 'specific' && watchEntityType && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entities..."
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {filteredEntities.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No entities found</p>
                  ) : (
                    filteredEntities.map(entity => (
                      <div
                        key={entity.id}
                        className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer"
                        onClick={() => toggleEntitySelection(entity.id)}
                      >
                        <Checkbox
                          checked={selectedEntityIds.includes(entity.id)}
                          onCheckedChange={() => toggleEntitySelection(entity.id)}
                        />
                        <span className="text-sm">
                          {entity.code} — {entity.name}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {selectedEntityIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedEntityIds.length} {watchEntityType}{selectedEntityIds.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Auditor Assignment */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Auditor Assignment</Label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={assignmentStrategy === 'auto_round_robin' ? 'default' : 'outline'}
                className={assignmentStrategy === 'auto_round_robin' ? 'bg-primary' : ''}
                onClick={() => setAssignmentStrategy('auto_round_robin')}
              >
                Auto (Round Robin)
              </Button>
              <Button
                type="button"
                variant={assignmentStrategy === 'assign_specific' ? 'default' : 'outline'}
                className={assignmentStrategy === 'assign_specific' ? 'bg-primary' : ''}
                onClick={() => setAssignmentStrategy('assign_specific')}
              >
                Specific Auditor
              </Button>
              <Button
                type="button"
                variant={assignmentStrategy === 'manual' ? 'default' : 'outline'}
                className={assignmentStrategy === 'manual' ? 'bg-primary' : ''}
                onClick={() => setAssignmentStrategy('manual')}
              >
                Manual
              </Button>
            </div>

            {assignmentStrategy === 'assign_specific' && (
              <div className="space-y-2">
                <Label>Select Auditor *</Label>
                <Select value={assignedAuditorId || '__none__'} onValueChange={(v) => setAssignedAuditorId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select auditor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Select auditor</SelectItem>
                    {auditors.map(auditor => (
                      <SelectItem key={auditor.id} value={auditor.id}>
                        {auditor.full_name} ({auditor.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary">
              {isEditing ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
