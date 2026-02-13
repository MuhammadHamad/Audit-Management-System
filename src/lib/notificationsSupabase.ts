import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/types';

export type NotificationInsert = {
  user_id: string;
  type: string;
  message: string;
  link_to?: string;
};

export async function insertNotification(row: NotificationInsert): Promise<void> {
  await insertNotifications([row]);
}

export async function insertNotifications(rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return;

  const payload = rows.map(r => ({
    user_id: r.user_id,
    type: r.type,
    message: r.message,
    link_to: r.link_to ?? null,
  }));

  const { error } = await (supabase as any).rpc('insert_notifications', {
    _rows: payload,
  });

  if (error) throw error;
}

export async function fetchUserIdsByRole(role: UserRole): Promise<string[]> {
  // Prefer user_roles (secure role source)
  const fromRoles = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', role);

  if (!fromRoles.error) {
    return (fromRoles.data ?? []).map(r => r.user_id).filter(Boolean);
  }

  // Fallback for older datasets
  const fromUsers = await supabase
    .from('users')
    .select('id')
    .eq('role', role);

  if (fromUsers.error) throw fromUsers.error;
  return (fromUsers.data ?? []).map(r => r.id).filter(Boolean);
}
