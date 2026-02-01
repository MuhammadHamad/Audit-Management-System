import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/RoleBadge';
import { Label } from '@/components/ui/label';

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.avatar_url} alt={user.full_name} />
            <AvatarFallback className="bg-primary text-lg text-primary-foreground">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold">{user.full_name}</h2>
            <RoleBadge role={user.role} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-muted-foreground">Email</Label>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Status</Label>
            <p className="font-medium capitalize">{user.status}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Phone</Label>
            <p className="font-medium">{user.phone || 'Not set'}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Last Login</Label>
            <p className="font-medium">
              {user.last_login_at
                ? new Date(user.last_login_at).toLocaleString()
                : 'N/A'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
