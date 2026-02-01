import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleBadge } from '@/components/RoleBadge';

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {user.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <span className="text-muted-foreground">Your role:</span>
          <RoleBadge role={user.role} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg text-muted-foreground">
            Dashboard content coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
