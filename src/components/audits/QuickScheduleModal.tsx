import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { AuditTemplate } from '@/lib/templateStorage';
import { useQuery } from '@tanstack/react-query';
import { fetchTemplates } from '@/lib/templateSupabase';
import { getBranches, getBCKs, getSuppliers, getUsersByRole } from '@/lib/entityStorage';
import { createAudit } from '@/lib/auditSupabase';
import { useAuth } from '@/contexts/AuthContext';

const formSchema = z.object({
  entity_type: z.enum(['branch', 'bck', 'supplier']),
  entity_id: z.string().min(1, 'Entity is required'),
  template_id: z.string().min(1, 'Template is required'),
});

interface QuickScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function QuickScheduleModal({ open, onOpenChange, onSuccess }: QuickScheduleModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    enabled: open,
  });

  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [auditorId, setAuditorId] = useState<string>('');
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [entities, setEntities] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [auditors, setAuditors] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entity_type: undefined,
      entity_id: '',
      template_id: '',
    },
  });

  const watchEntityType = form.watch('entity_type');

  useEffect(() => {
    if (open) {
      setTemplates(allTemplates.filter(t => t.status === 'active'));
      setAuditors(getUsersByRole('auditor'));
      form.reset({
        entity_type: undefined,
        entity_id: '',
        template_id: '',
      });
      setScheduledDate(undefined);
      setAuditorId('');
    }
  }, [open, form, allTemplates]);

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
    form.setValue('entity_id', '');
    form.setValue('template_id', '');
  }, [watchEntityType, form]);

  const filteredTemplates = templates.filter(t => 
    !watchEntityType || t.entity_type === watchEntityType
  );

  const isValid = form.formState.isValid && scheduledDate;

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!scheduledDate || !user) return;

    try {
      const audit = await createAudit({
        plan_id: undefined,
        template_id: data.template_id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        auditor_id: auditorId || undefined,
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        status: 'scheduled',
        created_by: user.id,
      });

      toast({
        title: 'Success',
        description: `Audit ${audit.audit_code} scheduled for ${format(scheduledDate, 'MMM d, yyyy')}.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to schedule audit.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Schedule One-time Audit</DialogTitle>
          <DialogDescription>
            Quickly schedule a single audit without creating a full plan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Entity Type *</Label>
            <Select
              value={form.watch('entity_type') || '__none__'}
              onValueChange={(value) => form.setValue('entity_type', value === '__none__' ? undefined as any : value as any, { shouldValidate: true })}
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
            <Label>Entity *</Label>
            <Select
              value={form.watch('entity_id') || '__none__'}
              onValueChange={(value) => form.setValue('entity_id', value === '__none__' ? '' : value, { shouldValidate: true })}
              disabled={!watchEntityType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Select entity</SelectItem>
                {entities.map(entity => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.code} — {entity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Template *</Label>
            <Select
              value={form.watch('template_id') || '__none__'}
              onValueChange={(value) => form.setValue('template_id', value === '__none__' ? '' : value, { shouldValidate: true })}
              disabled={!watchEntityType}
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

          <div className="space-y-2">
            <Label>Auditor (optional)</Label>
            <Select value={auditorId || '__none__'} onValueChange={(v) => setAuditorId(v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Assign later" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Assign later</SelectItem>
                {auditors.map(auditor => (
                  <SelectItem key={auditor.id} value={auditor.id}>
                    {auditor.full_name} ({auditor.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary" disabled={!isValid}>
              Schedule Audit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
