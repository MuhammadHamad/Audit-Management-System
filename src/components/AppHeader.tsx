import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MobileNav } from '@/components/MobileNav';
import { useIsMobile } from '@/hooks/use-mobile';

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
  '/notifications': 'Notifications',
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
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();

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
    <header className={`fixed top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-6 ${isMobile ? 'left-0 right-0' : 'left-64 right-0'}`}>
      {/* Left: Mobile Menu + Title */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        <MobileNav />
        
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{pageTitle}</h1>
          {parents.length > 0 && !isMobile && (
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
      </div>

      {/* Right: Theme Toggle, Notifications and User */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* Theme Toggle */}
        <ThemeToggle />
        
        {/* Notification Bell */}
        <NotificationBell />

        {/* User Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative h-9 w-9 md:h-10 md:w-10 rounded-full p-0"
              aria-label="User menu"
            >
              <Avatar className="h-9 w-9 md:h-10 md:w-10">
                <AvatarImage src={user.avatar_url} alt={user.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
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
