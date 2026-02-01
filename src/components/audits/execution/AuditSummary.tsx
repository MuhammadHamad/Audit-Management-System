import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Finding, CAPA } from '@/lib/auditExecutionStorage';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditSummaryProps {
  findings: Finding[];
  capas: CAPA[];
}

export function AuditSummary({ findings, capas }: AuditSummaryProps) {
  if (findings.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            Audit Complete - No Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-700">
            This audit was completed with no non-conformances detected. Great job!
          </p>
        </CardContent>
      </Card>
    );
  }

  const severityCounts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Audit Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-destructive">{severityCounts.critical}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-500">{severityCounts.high}</div>
              <div className="text-xs text-muted-foreground">High</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-500">{severityCounts.medium}</div>
              <div className="text-xs text-muted-foreground">Medium</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-500">{severityCounts.low}</div>
              <div className="text-xs text-muted-foreground">Low</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Findings ({findings.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {findings.map((finding, idx) => (
            <div
              key={finding.id}
              className="p-3 rounded-md border bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {finding.finding_code}
                    </span>
                    <Badge
                      variant={finding.severity === 'critical' || finding.severity === 'high' ? 'destructive' : 'secondary'}
                      className={cn(
                        'text-[10px] uppercase',
                        finding.severity === 'medium' && 'bg-amber-100 text-amber-800',
                        finding.severity === 'low' && 'bg-blue-100 text-blue-800'
                      )}
                    >
                      {finding.severity}
                    </Badge>
                  </div>
                  <p className="text-sm">{finding.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Section: {finding.section_name}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CAPA List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Corrective Actions ({capas.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {capas.map((capa) => (
            <div
              key={capa.id}
              className="p-3 rounded-md border bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {capa.capa_code}
                    </span>
                    <Badge
                      variant={capa.priority === 'critical' || capa.priority === 'high' ? 'destructive' : 'secondary'}
                      className={cn(
                        'text-[10px] uppercase',
                        capa.priority === 'medium' && 'bg-amber-100 text-amber-800',
                        capa.priority === 'low' && 'bg-blue-100 text-blue-800'
                      )}
                    >
                      {capa.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {capa.status}
                    </Badge>
                  </div>
                  <p className="text-sm line-clamp-2">{capa.description}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Clock className="h-3 w-3" />
                    Due: {format(new Date(capa.due_date), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
