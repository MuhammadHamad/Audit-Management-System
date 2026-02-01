import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Users',
  '/branches': 'Branches',
  '/bcks': 'BCKs',
  '/suppliers': 'Suppliers',
  '/regions': 'Regions',
  '/templates': 'Templates',
  '/audit-plans': 'Audit Plans',
  '/audits': 'Audits',
  '/capa': 'CAPA',
  '/incidents': 'Incidents',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/profile': 'Profile',
};

const routeParents: Record<string, { title: string; href: string }[]> = {
  '/branches': [{ title: 'Management', href: '#' }],
  '/bcks': [{ title: 'Management', href: '#' }],
  '/suppliers': [{ title: 'Management', href: '#' }],
  '/regions': [{ title: 'Management', href: '#' }],
  '/templates': [{ title: 'Audit Program', href: '#' }],
  '/audit-plans': [{ title: 'Audit Program', href: '#' }],
  '/audits': [{ title: 'Audit Program', href: '#' }],
  '/capa': [{ title: 'Audit Program', href: '#' }],
  '/incidents': [{ title: 'Audit Program', href: '#' }],
};

export function AppHeader() {
  const location = useLocation();
  const { user, logout, notifications, unreadCount, markAllAsRead } = useAuth();

  if (!user) return null;

  const currentPath = location.pathname;
  const pageTitle = routeTitles[currentPath] || 'Page';
  const parents = routeParents[currentPath] || [];

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Left: Title and Breadcrumb */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
        {parents.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {parents.map((parent, index) => (
              <span key={index} className="flex items-center gap-1">
                <span>{parent.title}</span>
                <ChevronRight className="h-3 w-3" />
              </span>
            ))}
            <span className="text-foreground">{pageTitle}</span>
          </nav>
        )}
      </div>

      {/* Right: Notifications and User */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs text-primary"
                  onClick={markAllAsRead}
                >
                  Mark all as read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            <ScrollArea className="h-64">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.slice(0, 10).map(notification => (
                  <div
                    key={notification.id}
                    className={`border-b border-border px-4 py-3 last:border-0 ${
                      !notification.read ? 'bg-muted/50' : ''
                    }`}
                  >
                    <p className="text-sm font-medium">{notification.title}</p>
                    {notification.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.avatar_url} alt={user.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/profile" className="cursor-pointer">
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
