import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TemplateSection } from '@/lib/templateStorage';
import { AuditItemResponse } from '@/lib/auditExecutionStorage';
import { ChecklistItem } from './ChecklistItem';

interface ItemState {
  response: AuditItemResponse | null;
  evidenceFiles: File[];
  evidenceUrls: string[];
  manualFinding: string;
}

interface ChecklistSectionProps {
  section: TemplateSection;
  itemStates: Map<string, ItemState>;
  isReadOnly: boolean;
  onResponseChange: (itemId: string, response: AuditItemResponse) => void;
  onAddEvidence: (itemId: string, file: File) => void;
  onRemoveEvidence: (itemId: string, index: number) => void;
  onRemoveEvidenceUrl: (itemId: string, index: number) => void;
  onManualFindingChange: (itemId: string, note: string) => void;
}

export function ChecklistSection({
  section,
  itemStates,
  isReadOnly,
  onResponseChange,
  onAddEvidence,
  onRemoveEvidence,
  onRemoveEvidenceUrl,
  onManualFindingChange,
}: ChecklistSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate completion for this section
  const completedCount = section.items.filter(item => {
    const state = itemStates.get(item.id);
    return state?.response !== null;
  }).length;

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer select-none py-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">{section.name}</h3>
            <Badge variant="secondary" className="text-xs">
              {section.weight}%
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {completedCount} of {section.items.length} items
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-2">
          {section.items
            .sort((a, b) => a.order - b.order)
            .map(item => {
              const state = itemStates.get(item.id) || {
                response: null,
                evidenceFiles: [],
                evidenceUrls: [],
                manualFinding: '',
              };

              return (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  state={state}
                  isReadOnly={isReadOnly}
                  onResponseChange={(response) => onResponseChange(item.id, response)}
                  onAddEvidence={(file) => onAddEvidence(item.id, file)}
                  onRemoveEvidence={(index) => onRemoveEvidence(item.id, index)}
                  onRemoveEvidenceUrl={(index) => onRemoveEvidenceUrl(item.id, index)}
                  onManualFindingChange={(note) => onManualFindingChange(item.id, note)}
                />
              );
            })}
        </CardContent>
      )}
    </Card>
  );
}
