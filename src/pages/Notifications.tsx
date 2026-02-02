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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

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
  capa: { icon: AlertCircle, color: 'text-orange-500' },
  finding: { icon: AlertTriangle, color: 'text-destructive' },
  audit: { icon: CheckSquare, color: 'text-blue-500' },
  system: { icon: Bell, color: 'text-muted-foreground' },
  general: { icon: Bell, color: 'text-muted-foreground' },
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, markAllAsRead, markAsRead } = useAuth();

  const handleNotificationClick = (notificationId: string, linkTo?: string) => {
    markAsRead(notificationId);
    if (linkTo) {
      navigate(linkTo);
    }
  };

  const getNotificationIcon = (type: string) => {
    const config = notificationIconMap[type] || notificationIconMap.general;
    const IconComponent = config.icon;
    return <IconComponent className={cn('h-5 w-5 flex-shrink-0', config.color)} />;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification.id, notification.link_to)}
                  className={cn(
                    'flex cursor-pointer gap-4 p-4 transition-colors hover:bg-muted/50',
                    !notification.read && 'bg-primary/5'
                  )}
                >
                  {/* Icon */}
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'text-sm',
                        !notification.read ? 'font-semibold' : 'font-medium'
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {notification.message && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                    )}
                  </div>

                  {/* Unread indicator */}
                  {!notification.read && (
                    <div className="mt-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
