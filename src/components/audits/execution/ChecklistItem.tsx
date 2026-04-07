import { useState, useRef } from 'react';
import { Star, Camera, X, ChevronDown, ChevronUp, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { TemplateItem } from '@/lib/templateStorage';
import { AuditItemResponse, CAPAPriority, calculateDueDate } from '@/lib/auditExecutionStorage';
import type { AuditExecutionItemState } from '@/hooks/useAuditExecution';

interface ChecklistItemProps {
  item: TemplateItem;
  state: AuditExecutionItemState;
  isReadOnly: boolean;
  onResponseChange: (response: AuditItemResponse) => void;
  onAddEvidence: (file: File) => void;
  onRemoveEvidence: (index: number) => void;
  onRemoveEvidenceUrl: (index: number) => void;
  onManualFindingChange: (note: string) => void;
  onCAPAPriorityChange: (priority: CAPAPriority | null) => void;
  onCAPADueDateChange: (dueDate: string | null) => void;
  checklistSubItems?: string[];
}

export function ChecklistItem({
  item,
  state,
  isReadOnly,
  onResponseChange,
  onAddEvidence,
  onRemoveEvidence,
  onRemoveEvidenceUrl,
  onManualFindingChange,
  onCAPAPriorityChange,
  onCAPADueDateChange,
  checklistSubItems = ['Sub-item 1', 'Sub-item 2', 'Sub-item 3'],
}: ChecklistItemProps) {
  const [showManualFinding, setShowManualFinding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasResponse = state.response !== null;
  const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
  const signedEvidenceUrls = (state.evidenceUrls || []).filter((u) => typeof u === 'string' && isHttpUrl(u));
  const totalEvidence = state.evidenceFiles.length + signedEvidenceUrls.length;

  // Determine border color based on state
  const getBorderColor = () => {
    if (!hasResponse) return 'border-l-muted-foreground/30';
    
    const evidenceRequired = item.evidence_required;
    if (evidenceRequired === 'required_1' && totalEvidence < 1) return 'border-l-destructive';
    if (evidenceRequired === 'required_2' && totalEvidence < 2) return 'border-l-destructive';
    
    return 'border-l-green-500';
  };

  // Check if item failed (for highlighting)
  const isFailed = () => {
    if (!state.response) return false;
    const value = state.response.value;
    
    if (item.type === 'pass_fail' && value === 'fail') return true;
    if (item.type === 'rating' && typeof value === 'number' && value <= 2) return true;

    if (item.type === 'checklist' && typeof value === 'object' && value !== null) {
      return Object.values(value as Record<string, boolean>).some(v => !v);
    }
    
    return false;
  };

  const shouldShowCAPAOverrides = isFailed() || !!state.manualFinding?.trim();

  const today = new Date().toISOString().split('T')[0];

  const renderCAPAOverrides = () => {
    if (!shouldShowCAPAOverrides) return null;

    return (
      <div className="mt-3 border rounded-md p-3 bg-muted/20">
        <div className="text-xs font-medium text-muted-foreground mb-2">CAPA Settings (Auditor)</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Priority</div>
            <Select
              value={state.capaPriority ?? 'auto'}
              onValueChange={(v) => {
                if (v === 'auto') {
                  onCAPAPriorityChange(null);
                  onCAPADueDateChange(null);
                  return;
                }
                const p = v as CAPAPriority;
                onCAPAPriorityChange(p);
                onCAPADueDateChange(calculateDueDate(p as any));
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Due date</div>
            <Input
              type="date"
              value={state.capaDueDate ?? ''}
              min={today}
              onChange={(e) => onCAPADueDateChange(e.target.value || null)}
              disabled={isReadOnly}
              className="h-9"
            />
          </div>
        </div>
      </div>
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => onAddEvidence(file));
    }
    e.target.value = '';
  };

  const renderInput = () => {
    switch (item.type) {
      case 'pass_fail': {
        const value = state.response?.value as 'pass' | 'fail' | undefined;
        return (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={value === 'pass' ? 'default' : 'outline'}
              className={cn(
                'h-8 min-w-[72px] px-3',
                value === 'pass' && 'bg-green-600 hover:bg-green-700 text-white'
              )}
              onClick={() => onResponseChange({ value: 'pass' })}
              disabled={isReadOnly}
            >
              Pass
            </Button>
            <Button
              type="button"
              size="sm"
              variant={value === 'fail' ? 'default' : 'outline'}
              className={cn(
                'h-8 min-w-[72px] px-3',
                value === 'fail' && 'bg-destructive hover:bg-destructive/90 text-white'
              )}
              onClick={() => onResponseChange({ value: 'fail' })}
              disabled={isReadOnly}
            >
              Fail
            </Button>
          </div>
        );
      }

      case 'rating': {
        const value = (state.response?.value as number) || 0;
        const scale = Math.max(1, item.points || 5);
        return (
          <div className="flex gap-1">
            {Array.from({ length: scale }, (_, i) => i + 1).map(rating => (
              <button
                key={rating}
                type="button"
                onClick={() => onResponseChange({ value: rating })}
                disabled={isReadOnly}
                className="p-0.5 focus:outline-none focus:ring-2 focus:ring-primary rounded disabled:opacity-50"
              >
                <Star
                  className={cn(
                    'h-5 w-5 transition-colors',
                    rating <= value
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/40'
                  )}
                />
              </button>
            ))}
          </div>
        );
      }

      case 'numeric': {
        const value = (state.response?.value as number) ?? '';
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="any"
              className="w-[120px]"
              placeholder="Value"
              min={0}
              max={item.points}
              value={value}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') {
                  onResponseChange({ value: null });
                  return;
                }

                const num = parseFloat(raw);
                if (!Number.isNaN(num)) {
                  const clamped = Math.min(item.points, Math.max(0, num));
                  onResponseChange({ value: clamped });
                }
              }}
              disabled={isReadOnly}
            />
            <span className="text-sm text-muted-foreground">/ {item.points}</span>
          </div>
        );
      }

      case 'photo': {
        return (
          <div className="flex items-center gap-2">
            <label className={cn(
              'flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer',
              'hover:bg-muted transition-colors',
              isReadOnly && 'opacity-50 cursor-not-allowed'
            )}>
              <Camera className="h-4 w-4" />
              <span className="text-sm">Take Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isReadOnly}
              />
            </label>
            {item.evidence_required !== 'none' && (
              <span className={cn(
                'text-xs',
                totalEvidence >= (item.evidence_required === 'required_2' ? 2 : 1)
                  ? 'text-green-600'
                  : 'text-destructive'
              )}>
                {totalEvidence} of {item.evidence_required === 'required_2' ? 2 : 1} required
              </span>
            )}
          </div>
        );
      }

      case 'text': {
        const value = (state.response?.value as string) || '';
        return (
          <Textarea
            className="min-h-[80px]"
            placeholder="Enter your observation..."
            value={value}
            onChange={e => onResponseChange({ value: e.target.value })}
            disabled={isReadOnly}
          />
        );
      }

      case 'checklist': {
        const value = (state.response?.value as Record<string, boolean>) || {};
        return (
          <div className="space-y-2">
            {checklistSubItems.map((subItem, idx) => {
              const subKey = `sub_${idx}`;
              const isChecked = value[subKey] || false;
              const hasOtherChecks = Object.values(value).some(Boolean);
              const showWarning = item.critical && hasOtherChecks && !isChecked;
              
              return (
                <div
                  key={subKey}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded',
                    showWarning && 'border border-destructive bg-destructive/5'
                  )}
                >
                  <Checkbox
                    id={`${item.id}_${subKey}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      onResponseChange({
                        value: { ...value, [subKey]: checked === true },
                      });
                    }}
                    disabled={isReadOnly}
                  />
                  <label
                    htmlFor={`${item.id}_${subKey}`}
                    className="text-sm cursor-pointer"
                  >
                    {subItem}
                  </label>
                </div>
              );
            })}
          </div>
        );
      }

      default:
        return null;
    }
  };

  const renderEvidenceArea = () => {
    // Photo type has its own upload, don't show separate area
    if (item.type === 'photo') return null;
    if (item.evidence_required === 'none') return null;

    const isRequired = item.evidence_required === 'required_1' || item.evidence_required === 'required_2';
    const requiredCount = item.evidence_required === 'required_2' ? 2 : 1;
    const isMet = totalEvidence >= requiredCount;

    return (
      <div className="mt-3 space-y-2">
        {isRequired ? (
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 transition-colors',
              isMet ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-destructive/60 bg-destructive/5',
              !isReadOnly && 'hover:bg-muted/40',
              isReadOnly && 'opacity-70 cursor-not-allowed'
            )}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">Evidence</div>
              <div className={cn('text-xs', isMet ? 'text-emerald-600' : 'text-destructive')}>
                {totalEvidence}/{requiredCount} uploaded
              </div>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="h-8" 
              disabled={isReadOnly}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={isReadOnly}
            />
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReadOnly}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Evidence
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={isReadOnly}
            />
          </div>
        )}

        {/* Evidence thumbnails */}
        {totalEvidence > 0 && (
          <div className="flex flex-wrap gap-3 pt-1">
            {signedEvidenceUrls.map((url, idx) => (
              <div key={`url-${idx}`} className="relative h-14 w-14">
                <img
                  src={url}
                  alt={`Evidence ${idx + 1}`}
                  className="h-full w-full object-cover rounded-md border"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveEvidenceUrl(idx)}
                    className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5 shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {state.evidenceFiles.map((file, idx) => (
              <div key={`file-${idx}`} className="relative h-14 w-14">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`New Evidence ${idx + 1}`}
                  className="h-full w-full object-cover rounded-md border"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveEvidence(idx)}
                    className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5 shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderManualFinding = () => {
    const hasManualNote = !!state.manualFinding?.trim();
    const shouldShow = isFailed() || hasManualNote;
    if (!shouldShow) return null;

    if (isReadOnly && hasManualNote) {
      return (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground">Observation</div>
          <Textarea
            className="mt-2 text-sm"
            value={state.manualFinding}
            disabled
            rows={2}
          />
        </div>
      );
    }

    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowManualFinding(!showManualFinding)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          disabled={isReadOnly}
        >
          {showManualFinding ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Add manual finding note
        </button>

        {showManualFinding && (
          <Textarea
            className="mt-2 text-sm"
            placeholder="Add additional context for this finding..."
            value={state.manualFinding}
            onChange={e => onManualFindingChange(e.target.value)}
            disabled={isReadOnly}
            rows={2}
          />
        )}
      </div>
    );
  };

  return (
    <div
      id={`item-${item.id}`}
      className={cn(
        'border-l-4 pl-4 py-3 transition-colors',
        getBorderColor(),
        isFailed() && item.critical && 'bg-destructive/5'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.critical && (
              <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-5">
                <AlertTriangle className="h-3 w-3 mr-0.5" />
                CRITICAL
              </Badge>
            )}
            <span className="font-medium text-sm">{item.text}</span>
          </div>
          
          {item.help_text && (
            <p className="text-xs text-muted-foreground italic mb-2">
              {item.help_text}
            </p>
          )}

          {/* Full width input for text/checklist types */}
          {(item.type === 'text' || item.type === 'checklist') && (
            <div className="mt-2">{renderInput()}</div>
          )}

          {/* Photo thumbnails for photo type */}
          {item.type === 'photo' && totalEvidence > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {signedEvidenceUrls.map((url, idx) => (
                <div key={`url-${idx}`} className="relative h-14 w-14">
                  <img
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    className="h-full w-full object-cover rounded-md border"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveEvidenceUrl(idx)}
                      className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5 shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {state.evidenceFiles.map((file, idx) => (
                <div key={`file-${idx}`} className="relative h-14 w-14">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`New Evidence ${idx + 1}`}
                    className="h-full w-full object-cover rounded-md border"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveEvidence(idx)}
                      className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5 shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {renderEvidenceArea()}
          {renderManualFinding()}
          {renderCAPAOverrides()}
        </div>

        {/* Right side input for compact types */}
        {!['text', 'checklist'].includes(item.type) && (
          <div className="flex-shrink-0 pt-0.5">
            {renderInput()}
          </div>
        )}
      </div>
    </div>
  );
}
