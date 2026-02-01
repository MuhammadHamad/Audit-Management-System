import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Audit, getEntityName } from '@/lib/auditStorage';
import { getUserById } from '@/lib/entityStorage';

interface AuditCalendarProps {
  audits: Audit[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  branch: 'bg-muted text-muted-foreground',
  bck: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  supplier: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function AuditCalendar({ audits, currentDate, onDateChange }: AuditCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Generate all days for the calendar grid
  const days = useMemo(() => {
    const daysArray: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      daysArray.push(day);
      day = addDays(day, 1);
    }
    return daysArray;
  }, [calendarStart, calendarEnd]);

  // Group audits by date
  const auditsByDate = useMemo(() => {
    const grouped: Record<string, Audit[]> = {};
    for (const audit of audits) {
      const dateKey = audit.scheduled_date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(audit);
    }
    return grouped;
  }, [audits]);

  const handlePrevMonth = () => {
    onDateChange(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    onDateChange(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const getAuditorName = (auditorId?: string): string => {
    if (!auditorId) return 'Unassigned';
    const user = getUserById(auditorId);
    return user?.full_name || 'Unknown';
  };

  return (
    <div className="space-y-4">
      {/* Calendar Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <Button variant="outline" size="sm" onClick={handleToday}>
          Today
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-muted">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
              {day}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayAudits = auditsByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, today);
            const visibleAudits = dayAudits.slice(0, 2);
            const moreCount = dayAudits.length - 2;

            return (
              <div
                key={idx}
                className={cn(
                  'min-h-[100px] border-t border-r p-1',
                  !isCurrentMonth && 'bg-muted/30',
                  idx % 7 === 0 && 'border-l-0',
                  idx >= days.length - 7 && 'border-b-0'
                )}
              >
                {/* Day Number */}
                <div className="flex justify-end mb-1">
                  <span
                    className={cn(
                      'text-sm w-7 h-7 flex items-center justify-center rounded-full',
                      isToday && 'bg-primary text-primary-foreground',
                      !isCurrentMonth && 'text-muted-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Audit Pills */}
                <div className="space-y-1">
                  {visibleAudits.map(audit => (
                    <Tooltip key={audit.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer',
                            ENTITY_TYPE_COLORS[audit.entity_type],
                            audit.status === 'cancelled' && 'opacity-50 line-through',
                            audit.status === 'overdue' && 'ring-1 ring-destructive'
                          )}
                        >
                          {audit.status === 'overdue' && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive mr-1" />
                          )}
                          {getEntityName(audit.entity_type, audit.entity_id)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <div className="space-y-1">
                          <p className="font-semibold">{audit.audit_code}</p>
                          <p>{getEntityName(audit.entity_type, audit.entity_id)}</p>
                          <p className="text-muted-foreground">Auditor: {getAuditorName(audit.auditor_id)}</p>
                          <Badge variant="secondary" className="text-xs">
                            {audit.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}

                  {moreCount > 0 && (
                    <p className="text-xs text-muted-foreground px-1">
                      +{moreCount} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
