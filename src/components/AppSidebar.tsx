import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { navigationConfig } from '@/config/navigation';
import { RoleBadge } from '@/components/RoleBadge';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  MapPin,
  Factory,
  Truck,
  Map,
  FileText,
  CalendarDays,
  ClipboardCheck,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  Flame,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  MapPin,
  Factory,
  Truck,
  Map,
  FileText,
  CalendarDays,
  ClipboardCheck,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Settings,
};

export function AppSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const filteredNavigation = navigationConfig
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.roles.includes(user.role)),
    }))
    .filter(section => section.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo Section */}
        <div className="flex items-center gap-2 border-b border-sidebar-border px-6 py-5">
          <Flame className="h-6 w-6 text-accent" />
          <span className="text-xl font-bold text-sidebar-foreground">Burgerizzr</span>
        </div>

        {/* User Info */}
        <div className="border-b border-sidebar-border px-6 py-4">
          <p className="text-sm font-medium text-sidebar-foreground">{user.full_name}</p>
          <div className="mt-1">
            <RoleBadge role={user.role} />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {filteredNavigation.map(section => (
            <div key={section.title} className="mb-6">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map(item => {
                  const Icon = iconMap[item.icon];
                  const isActive = location.pathname === item.href;
                  
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        {Icon && <Icon className="h-[18px] w-[18px]" />}
                        <span>{item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
