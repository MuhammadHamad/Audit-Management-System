/**
 * Audit Manager Dashboard Components
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Clock,
  ArrowRight,
  Building2,
  Factory,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  KPIData, 
  CriticalAlert, 
  HeatmapRegion, 
  ActiveAuditItem,
  CAPAOverviewData,
  IncidentSummaryData,
  AuditorWorkloadItem,
} from '@/lib/dashboardStats';
import { getThresholdConfig } from '@/lib/healthScoreEngine';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============= KPI CARDS =============
interface KPICardProps {
  label: string;
  value: number;
  previousValue?: number;
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red';
  showTrend?: boolean;
  isInverse?: boolean; // For metrics where lower is better
  suffix?: string;
}

const colorClasses: Record<string, string> = {
  default: 'text-foreground',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-500',
  red: 'text-red-500',
};

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  previousValue,
  color = 'default',
  showTrend = true,
  isInverse = false,
  suffix = '',
}) => {
  const hasTrend = showTrend && previousValue !== undefined && previousValue > 0;
  const diff = previousValue ? value - previousValue : 0;
  const improved = isInverse ? diff < 0 : diff > 0;
  const regressed = isInverse ? diff > 0 : diff < 0;

  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <span className={cn('text-3xl font-semibold', colorClasses[color])}>
            {value}{suffix}
          </span>
          {hasTrend && diff !== 0 && (
            <span className={cn('flex items-center text-sm', improved ? 'text-green-500' : 'text-red-500')}>
              {improved ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
};

interface KPIGridProps {
  data: KPIData;
}

export const KPIGrid: React.FC<KPIGridProps> = ({ data }) => {
  const passRateColor = data.passRate >= 80 ? 'green' : data.passRate >= 60 ? 'yellow' : 'red';
  const openCAPAColor = data.openCAPA > 0 ? 'red' : 'default';
  const criticalColor = data.criticalFindings > 0 ? 'red' : 'default';
  const pendingColor = data.pendingVerification > 0 ? 'yellow' : 'default';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KPICard 
        label="Total Entities" 
        value={data.totalEntities} 
        showTrend={false}
      />
      <KPICard 
        label="Audits This Month" 
        value={data.auditsThisMonth} 
        previousValue={data.auditsLastMonth}
        color="blue"
      />
      <KPICard 
        label="Pass Rate (90d)" 
        value={data.passRate} 
        previousValue={data.passRatePrevious}
        color={passRateColor}
        suffix="%"
      />
      <KPICard 
        label="Open CAPA" 
        value={data.openCAPA} 
        previousValue={data.openCAPAPrevious}
        color={openCAPAColor}
        isInverse
      />
      <KPICard 
        label="Critical Findings" 
        value={data.criticalFindings} 
        previousValue={data.criticalFindingsPrevious}
        color={criticalColor}
        isInverse
      />
      <KPICard 
        label="Pending Verification" 
        value={data.pendingVerification} 
        previousValue={data.pendingVerificationPrevious}
        color={pendingColor}
        isInverse
      />
    </div>
  );
};

// ============= CRITICAL ALERTS STRIP =============
interface CriticalAlertsStripProps {
  alerts: CriticalAlert[];
}

export const CriticalAlertsStrip: React.FC<CriticalAlertsStripProps> = ({ alerts }) => {
  if (alerts.length === 0) return null;

  const displayedAlerts = alerts.slice(0, 5);
  const remainingCount = alerts.length - 5;

  return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="font-semibold text-red-600 dark:text-red-400">Critical Alerts</span>
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-2">
            {displayedAlerts.map(alert => (
              <Link 
                key={alert.id} 
                to={alert.linkTo}
                className="flex-shrink-0 bg-red-600 text-white text-sm px-3 py-1 rounded-full hover:bg-red-700 transition-colors"
              >
                {alert.title} — {alert.entityName.slice(0, 20)}{alert.entityName.length > 20 ? '...' : ''}
              </Link>
            ))}
            {remainingCount > 0 && (
              <span className="flex-shrink-0 bg-red-800 text-white text-sm px-3 py-1 rounded-full">
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============= HEALTH SCORE HEATMAP =============
interface HeatmapTileProps {
  entity: {
    id: string;
    code: string;
    name: string;
    type: 'branch' | 'bck';
    score: number;
    hasAuditHistory: boolean;
  };
}

const HeatmapTile: React.FC<HeatmapTileProps> = ({ entity }) => {
  const threshold = getThresholdConfig(entity.score, entity.type === 'bck' ? 'bck' : 'branch');
  const displayScore = entity.hasAuditHistory || entity.score > 0 ? entity.score : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center gap-1">
            <div 
              className="w-12 h-12 rounded flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-white/50 transition-all"
              style={{ backgroundColor: threshold.color }}
            >
              <span className="text-white text-sm font-semibold">
                {displayScore !== null ? Math.round(displayScore) : '—'}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate max-w-12 text-center">
              {entity.code.slice(0, 6)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-sm">
            <p className="font-semibold">{entity.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {entity.type === 'branch' ? 'Branch' : 'BCK'}
              </Badge>
              <span style={{ color: threshold.color }} className="font-medium">
                {displayScore !== null ? displayScore : 'No data'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{threshold.label}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface HealthScoreHeatmapProps {
  regions: HeatmapRegion[];
}

export const HealthScoreHeatmap: React.FC<HealthScoreHeatmapProps> = ({ regions }) => {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Health Score Heatmap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {regions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No entities with health scores.</p>
        ) : (
          <>
            {regions.map(region => (
              <div key={region.id} className="space-y-2">
                <div>
                  <span className="font-semibold text-sm">{region.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{region.code}</span>
                </div>
                <div className="flex items-start gap-1 flex-wrap">
                  {region.branches.map(branch => (
                    <HeatmapTile key={branch.id} entity={branch} />
                  ))}
                  {region.branches.length > 0 && region.bcks.length > 0 && (
                    <div className="w-px h-12 bg-border mx-2" />
                  )}
                  {region.bcks.map(bck => (
                    <HeatmapTile key={bck.id} entity={bck} />
                  ))}
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-4 pt-4 border-t text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(160, 84%, 39%)' }} />
                <span className="text-muted-foreground">Excellent (85-100)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
                <span className="text-muted-foreground">Good (70-84)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(25, 95%, 53%)' }} />
                <span className="text-muted-foreground">Needs Improvement (50-69)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} />
                <span className="text-muted-foreground">Critical (0-49)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ============= ACTIVE AUDIT FEED =============
interface ActiveAuditFeedProps {
  audits: ActiveAuditItem[];
  onFilterChange: (needsAttention: boolean) => void;
  filterNeedsAttention: boolean;
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  submitted: 'bg-yellow-500',
  pending_verification: 'bg-orange-500',
  overdue: 'bg-red-500',
};

export const ActiveAuditFeed: React.FC<ActiveAuditFeedProps> = ({ 
  audits, 
  onFilterChange,
  filterNeedsAttention,
}) => {
  const getRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'due today';
    if (diffDays === 1) return 'due tomorrow';
    if (diffDays === -1) return 'due yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    return `due in ${diffDays} days`;
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Active Audits</CardTitle>
            <Badge variant="secondary" className="text-xs">{audits.length}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <Button 
            variant={!filterNeedsAttention ? "default" : "outline"} 
            size="sm"
            onClick={() => onFilterChange(false)}
            className="h-7 text-xs"
          >
            All
          </Button>
          <Button 
            variant={filterNeedsAttention ? "default" : "outline"} 
            size="sm"
            onClick={() => onFilterChange(true)}
            className="h-7 text-xs"
          >
            Needs Attention
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
        {audits.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No active audits right now.</p>
        ) : (
          <>
            {audits.map(audit => (
              <Link 
                key={audit.id} 
                to={`/audits/${audit.id}`}
                className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
              >
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', statusColors[audit.status])} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{audit.auditCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{audit.entityName.slice(0, 30)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs">{audit.auditorName}</p>
                  <p className={cn(
                    'text-xs',
                    audit.status === 'overdue' ? 'text-red-500' : 'text-muted-foreground'
                  )}>
                    {getRelativeDate(audit.scheduledDate)}
                  </p>
                </div>
              </Link>
            ))}
            <Link 
              to="/audits" 
              className="flex items-center justify-center gap-1 text-sm text-primary hover:underline py-2"
            >
              View all audits <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ============= CAPA OVERVIEW =============
interface CAPAOverviewProps {
  data: CAPAOverviewData;
}

export const CAPAOverview: React.FC<CAPAOverviewProps> = ({ data }) => {
  const total = data.open + data.inProgress + data.pendingVerification + data.escalated + data.closed;
  
  const getBarWidth = (value: number) => {
    if (total === 0) return 0;
    return (value / total) * 100;
  };

  const segments = [
    { key: 'open', value: data.open, color: '#9CA3AF', label: 'Open' },
    { key: 'inProgress', value: data.inProgress, color: '#3B82F6', label: 'In Progress' },
    { key: 'pendingVerification', value: data.pendingVerification, color: '#F59E0B', label: 'Pending Verification' },
    { key: 'escalated', value: data.escalated, color: '#FF8C00', label: 'Escalated' },
    { key: 'closed', value: data.closed, color: '#10B981', label: 'Closed' },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">CAPA Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xl font-semibold text-muted-foreground">{data.open}</p>
            <p className="text-xs text-muted-foreground">Open</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xl font-semibold text-blue-500">{data.inProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xl font-semibold text-red-500">{data.overdue}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xl font-semibold text-orange-500">{data.escalated}</p>
            <p className="text-xs text-muted-foreground">Escalated</p>
          </div>
        </div>

        {/* Stacked bar chart */}
        {total > 0 && (
          <div>
            <div className="h-6 rounded-md overflow-hidden flex">
              {segments.map(seg => 
                seg.value > 0 && (
                  <div 
                    key={seg.key}
                    className="flex items-center justify-center"
                    style={{ 
                      width: `${getBarWidth(seg.value)}%`, 
                      backgroundColor: seg.color,
                      minWidth: seg.value > 0 ? '20px' : 0,
                    }}
                  >
                    {getBarWidth(seg.value) >= 10 && (
                      <span className="text-xs text-white font-medium">{seg.value}</span>
                    )}
                  </div>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {segments.map(seg => (
                <div key={seg.key} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top overdue */}
        {data.topOverdue.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Top Overdue CAPA</h4>
            <div className="space-y-2">
              {data.topOverdue.map(capa => (
                <Link 
                  key={capa.id}
                  to={`/capa/${capa.id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{capa.capaCode}</p>
                    <p className="text-xs text-muted-foreground">{capa.entityName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-xs',
                        capa.priority === 'critical' && 'border-red-500 text-red-500',
                        capa.priority === 'high' && 'border-orange-500 text-orange-500',
                      )}
                    >
                      {capa.priority}
                    </Badge>
                    <span className="text-xs text-red-500 font-medium">
                      {capa.daysOverdue}d overdue
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ============= INCIDENT SUMMARY =============
interface IncidentSummaryProps {
  data: IncidentSummaryData;
}

export const IncidentSummary: React.FC<IncidentSummaryProps> = ({ data }) => {
  const totalOpen = data.bySeverity.critical + data.bySeverity.high + data.bySeverity.medium + data.bySeverity.low;
  
  // Donut chart calculations
  const segments = [
    { severity: 'critical', value: data.bySeverity.critical, color: '#EF4444' },
    { severity: 'high', value: data.bySeverity.high, color: '#FF8C00' },
    { severity: 'medium', value: data.bySeverity.medium, color: '#F59E0B' },
    { severity: 'low', value: data.bySeverity.low, color: '#3B82F6' },
  ].filter(s => s.value > 0);

  const getDonutPath = () => {
    if (totalOpen === 0) {
      return <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="20" />;
    }

    const paths: React.ReactNode[] = [];
    let currentAngle = -90; // Start from top

    segments.forEach((segment, index) => {
      const percentage = segment.value / totalOpen;
      const angle = percentage * 360;
      const endAngle = currentAngle + angle;

      const startX = 50 + 40 * Math.cos((currentAngle * Math.PI) / 180);
      const startY = 50 + 40 * Math.sin((currentAngle * Math.PI) / 180);
      const endX = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
      const endY = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);

      const largeArcFlag = angle > 180 ? 1 : 0;

      paths.push(
        <path
          key={segment.severity}
          d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
          fill={segment.color}
        />
      );

      currentAngle = endAngle;
    });

    return paths;
  };

  const getRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  };

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Incidents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xl font-semibold text-blue-500">{data.openThisMonth}</p>
            <p className="text-xs text-muted-foreground">Open This Month</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className={cn('text-xl font-semibold', data.critical > 0 ? 'text-red-500' : 'text-muted-foreground')}>
              {data.critical}
            </p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </div>
        </div>

        {/* Donut chart */}
        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {totalOpen === 0 ? (
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="4" />
              ) : (
                getDonutPath()
              )}
              <circle cx="50" cy="50" r="25" fill="currentColor" className="text-background" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold">{totalOpen}</span>
              <span className="text-xs text-muted-foreground">Open</span>
            </div>
          </div>
        </div>

        {totalOpen === 0 && (
          <p className="text-center text-sm text-muted-foreground">No open incidents.</p>
        )}

        {/* Legend */}
        {totalOpen > 0 && (
          <div className="flex justify-center gap-4">
            {segments.map(seg => (
              <div key={seg.severity} className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded" style={{ backgroundColor: seg.color }} />
                <span className="text-muted-foreground capitalize">{seg.severity}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent incidents */}
        {data.recent.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Recent Incidents</h4>
            <div className="space-y-1">
              {data.recent.map(incident => (
                <Link 
                  key={incident.id}
                  to={`/incidents/${incident.id}`}
                  className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', severityColors[incident.severity])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{incident.title.slice(0, 40)}</p>
                    <p className="text-xs text-muted-foreground">{incident.entityName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {getRelativeDate(incident.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.recent.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">No incidents recorded.</p>
        )}
      </CardContent>
    </Card>
  );
};

// ============= AUDITOR WORKLOAD TABLE =============
interface AuditorWorkloadTableProps {
  auditors: AuditorWorkloadItem[];
}

export const AuditorWorkloadTable: React.FC<AuditorWorkloadTableProps> = ({ auditors }) => {
  const maxWorkload = 10;

  const getWorkloadColor = (score: number) => {
    if (score >= 9) return 'bg-red-500';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Auditor Workload</CardTitle>
      </CardHeader>
      <CardContent>
        {auditors.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            No auditors in the system. Add auditors in User Management.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Auditor</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Scheduled</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">In Progress</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Submitted</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Completed (30d)</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground w-40">Workload</th>
                </tr>
              </thead>
              <tbody>
                {auditors.map(auditor => (
                  <tr key={auditor.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {getInitials(auditor.name)}
                        </div>
                        <span className="font-medium">{auditor.name}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">{auditor.scheduled}</td>
                    <td className="text-center py-3 px-2">{auditor.inProgress}</td>
                    <td className="text-center py-3 px-2">{auditor.submitted}</td>
                    <td className="text-center py-3 px-2">{auditor.completed30d}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn('h-full rounded-full transition-all', getWorkloadColor(auditor.workloadScore))}
                            style={{ width: `${Math.min(100, (auditor.workloadScore / maxWorkload) * 100)}%` }}
                          />
                        </div>
                        <span className={cn(
                          'text-xs font-medium',
                          auditor.workloadScore >= 9 && 'text-red-500'
                        )}>
                          {auditor.workloadScore}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
