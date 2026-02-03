import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { User, UserRole, UserStatus, Notification } from '@/types';
import { initializeCache } from '@/lib/userStorage';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  notifications: Notification[];
  unreadCount: number;
  markAllAsRead: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch user profile from database
  const fetchUserProfile = async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone || undefined,
        role: data.role as UserRole,
        avatar_url: undefined, // Supabase doesn't store avatars in users table by default
        status: (data.status || 'active') as UserStatus,
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
        last_login_at: data.last_login || undefined,
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  // Fetch user role from user_roles table
  const fetchUserRole = async (userId: string): Promise<UserRole | null> => {
    try {
      const { data, error } = await supabase
        .rpc('get_user_role', { _user_id: userId });

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return data as UserRole;
    } catch (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
  };

  // Load notifications for user
  const loadNotifications = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      // Map database notifications to Notification type
      const mappedNotifications: Notification[] = (data || []).map(n => ({
        id: n.id,
        user_id: n.user_id || '',
        type: n.type,
        title: n.message.split('\n')[0] || n.type, // Use first line of message as title
        message: n.message,
        link_to: n.link_to || undefined,
        read: n.read || false,
        created_at: n.created_at || '',
      }));

      setNotifications(mappedNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        
        if (newSession?.user) {
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(async () => {
            const profile = await fetchUserProfile(newSession.user.id);
            if (profile) {
              setUser(profile);
              loadNotifications(newSession.user.id);
            } else {
              // User exists in auth but not in users table - clear session
              setUser(null);
            }
            setIsLoading(false);
          }, 0);
        } else {
          setUser(null);
          setNotifications([]);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session and initialize cache
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      setSession(existingSession);
      
      if (existingSession?.user) {
        // Initialize the data cache for sync functions
        await initializeCache();
        
        const profile = await fetchUserProfile(existingSession.user.id);
        if (profile) {
          setUser(profile);
          loadNotifications(existingSession.user.id);
        }
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Login failed' };
      }

      // Fetch user profile to verify they exist in our users table
      const profile = await fetchUserProfile(data.user.id);
      
      if (!profile) {
        // User exists in auth but not in our users table
        await supabase.auth.signOut();
        return { success: false, error: 'User account not found. Please contact an administrator.' };
      }

      if (profile.status !== 'active') {
        await supabase.auth.signOut();
        return { success: false, error: 'Account is inactive' };
      }

      // Update last login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setNotifications([]);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const markAsRead = async (id: string) => {
    if (!user) return;
    
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      
      setNotifications(prev => prev.map(n => 
        n.id === id ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        login,
        logout,
        notifications,
        unreadCount,
        markAllAsRead,
        markAsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
