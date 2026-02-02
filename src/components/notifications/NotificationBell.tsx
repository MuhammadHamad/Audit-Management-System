import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Bell, 
  BellOff,
  AlertCircle, 
  XCircle, 
  CheckSquare, 
  CheckCircle, 
  Flag, 
  AlertTriangle, 
  Ban, 
  Clipboard, 
  TrendingUp 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// Notification type to icon mapping
const notificationIconMap: Record<string, { icon: React.ComponentType<{ className?: string }>, color: string }> = {
  capa_assigned: { icon: AlertCircle, color: 'text-orange-500' },
  capa_rejected: { icon: XCircle, color: 'text-destructive' },
  audit_submitted: { icon: CheckSquare, color: 'text-blue-500' },
  audit_approved: { icon: CheckCircle, color: 'text-green-500' },
  audit_flagged: { icon: Flag, color: 'text-destructive' },
  incident_critical: { icon: AlertTriangle, color: 'text-destructive' },
  critical_incident: { icon: AlertTriangle, color: 'text-destructive' },
  supplier_suspended: { icon: Ban, color: 'text-destructive' },
  task_assigned: { icon: Clipboard, color: 'text-blue-500' },
  escalation: { icon: TrendingUp, color: 'text-orange-500' },
  capa_escalated: { icon: TrendingUp, color: 'text-orange-500' },
  capa_pending_verification: { icon: CheckSquare, color: 'text-blue-500' },
  incident_assigned: { icon: AlertTriangle, color: 'text-orange-500' },
  incident_resolved: { icon: CheckCircle, color: 'text-green-500' },
  // Legacy types
  capa: { icon: AlertCircle, color: 'text-orange-500' },
  finding: { icon: AlertTriangle, color: 'text-destructive' },
  audit: { icon: CheckSquare, color: 'text-blue-500' },
  system: { icon: Bell, color: 'text-muted-foreground' },
  general: { icon: Bell, color: 'text-muted-foreground' },
};

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useAuth();
  const [open, setOpen] = useState(false);

  const handleNotificationClick = (notificationId: string, linkTo?: string) => {
    markAsRead(notificationId);
    setOpen(false);
    if (linkTo) {
      navigate(linkTo);
    }
  };

  const getNotificationIcon = (type: string) => {
    const config = notificationIconMap[type] || notificationIconMap.general;
    const IconComponent = config.icon;
    return <IconComponent className={cn('h-4 w-4 flex-shrink-0', config.color)} />;
  };

  const truncateMessage = (message: string | undefined, maxLength: number = 60) => {
    if (!message) return '';
    return message.length > maxLength ? message.slice(0, maxLength) + '...' : message;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span 
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground"
              aria-live="polite"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-primary hover:text-primary"
              onClick={() => {
                markAllAsRead();
              }}
            >
              Mark all as read
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 10).map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification.id, notification.link_to)}
                  className={cn(
                    'flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50',
                    !notification.read && 'bg-primary/5'
                  )}
                >
                  {/* Icon */}
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm',
                      !notification.read ? 'font-semibold' : 'font-medium'
                    )}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {truncateMessage(notification.message)}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>

                  {/* Unread indicator */}
                  {!notification.read && (
                    <div className="mt-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary hover:text-primary"
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
            >
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
