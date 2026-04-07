import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { routeAccess } from '@/config/navigation';
import { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check route-specific access
  const getRouteRoles = (): UserRole[] | undefined => {
    if (allowedRoles) return allowedRoles;

    const exact = routeAccess[location.pathname];
    if (exact) return exact;

    const path = location.pathname;
    if (path.startsWith('/audits/') && !path.startsWith('/audits/pending-verification')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 2) {
        return routeAccess['/audits/:id'];
      }
    }

    return undefined;
  };

  const routeRoles = getRouteRoles();
  if (routeRoles && !routeRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
