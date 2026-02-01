import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { getUsersByRole } from '@/lib/entityStorage';
import { Audit, updateAudit } from '@/lib/auditStorage';

interface AssignAuditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: Audit | null;
  onSuccess: () => void;
}

export function AssignAuditorModal({ open, onOpenChange, audit, onSuccess }: AssignAuditorModalProps) {
  const { toast } = useToast();
  const [auditorId, setAuditorId] = useState<string>('');
  const auditors = getUsersByRole('auditor');

  const handleSubmit = () => {
    if (!audit) return;

    updateAudit(audit.id, { 
      auditor_id: auditorId === '__none__' ? undefined : auditorId 
    });

    toast({
      title: 'Success',
      description: 'Auditor assigned successfully.',
    });

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Assign Auditor</DialogTitle>
          <DialogDescription>
            {audit?.audit_code}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Auditor</Label>
            <Select 
              value={auditorId || audit?.auditor_id || '__none__'} 
              onValueChange={setAuditorId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select auditor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {auditors.map(auditor => (
                  <SelectItem key={auditor.id} value={auditor.id}>
                    {auditor.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-primary">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
