import { useState } from 'react';
import { Star, Camera, X, ChevronDown, ChevronUp, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TemplateItem } from '@/lib/templateStorage';
import { AuditItemResponse } from '@/lib/auditExecutionStorage';

interface ItemState {
  response: AuditItemResponse | null;
  evidenceFiles: File[];
  evidenceUrls: string[];
  manualFinding: string;
}

interface ChecklistItemProps {
  item: TemplateItem;
  state: ItemState;
  isReadOnly: boolean;
  onResponseChange: (response: AuditItemResponse) => void;
  onAddEvidence: (file: File) => void;
  onRemoveEvidence: (index: number) => void;
  onRemoveEvidenceUrl: (index: number) => void;
  onManualFindingChange: (note: string) => void;
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
  checklistSubItems = ['Sub-item 1', 'Sub-item 2', 'Sub-item 3'],
}: ChecklistItemProps) {
  const [showManualFinding, setShowManualFinding] = useState(false);
  const hasResponse = state.response !== null;
  const totalEvidence = state.evidenceFiles.length + state.evidenceUrls.length;

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
    
    return false;
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
                'min-w-[80px]',
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
                'min-w-[80px]',
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
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(rating => (
              <button
                key={rating}
                type="button"
                onClick={() => onResponseChange({ value: rating })}
                disabled={isReadOnly}
                className="p-0.5 focus:outline-none focus:ring-2 focus:ring-primary rounded disabled:opacity-50"
              >
                <Star
                  className={cn(
                    'h-6 w-6 transition-colors',
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
          <Input
            type="number"
            step="any"
            className="w-[120px]"
            placeholder="Value"
            value={value}
            onChange={e => {
              const num = e.target.value === '' ? null : parseFloat(e.target.value);
              if (num !== null && !isNaN(num)) {
                onResponseChange({ value: num });
              }
            }}
            disabled={isReadOnly}
          />
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
      <div className="mt-3">
        {isRequired ? (
          <div
            className={cn(
              'border-2 border-dashed rounded-md p-4 text-center transition-colors',
              isMet ? 'border-green-500 bg-green-50' : 'border-destructive bg-destructive/5'
            )}
          >
            <label className="cursor-pointer">
              <div className={cn(
                'text-sm',
                isMet ? 'text-green-700' : 'text-destructive'
              )}>
                📎 {isMet ? `${totalEvidence} photo(s) uploaded` : `Upload evidence (required: ${requiredCount})`}
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={isReadOnly}
              />
            </label>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => document.getElementById(`evidence-${item.id}`)?.click()}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            disabled={isReadOnly}
          >
            <Plus className="h-3 w-3" />
            Add Evidence
            <input
              id={`evidence-${item.id}`}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={isReadOnly}
            />
          </button>
        )}

        {/* Evidence thumbnails */}
        {totalEvidence > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {state.evidenceUrls.map((url, idx) => (
              <div key={`url-${idx}`} className="relative">
                <img
                  src={url}
                  alt={`Evidence ${idx + 1}`}
                  className="h-16 w-16 object-cover rounded border"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveEvidenceUrl(idx)}
                    className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {state.evidenceFiles.map((file, idx) => (
              <div key={`file-${idx}`} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`New Evidence ${idx + 1}`}
                  className="h-16 w-16 object-cover rounded border"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveEvidence(idx)}
                    className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
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
    // Only show for failed items or low ratings
    if (!isFailed()) return null;

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
            <div className="flex flex-wrap gap-2 mt-2">
              {state.evidenceUrls.map((url, idx) => (
                <div key={`url-${idx}`} className="relative">
                  <img
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    className="h-16 w-16 object-cover rounded border"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveEvidenceUrl(idx)}
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {state.evidenceFiles.map((file, idx) => (
                <div key={`file-${idx}`} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`New Evidence ${idx + 1}`}
                    className="h-16 w-16 object-cover rounded border"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveEvidence(idx)}
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
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
        </div>

        {/* Right side input for compact types */}
        {!['text', 'checklist'].includes(item.type) && (
          <div className="flex-shrink-0">
            {renderInput()}
          </div>
        )}
      </div>
    </div>
  );
}
