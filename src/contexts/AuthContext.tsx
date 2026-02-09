import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { User, UserRole, UserStatus, Notification } from '@/types';
import { initializeCache } from '@/lib/userStorage';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
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

      const roleFromRolesTable = await fetchUserRole(userId);

      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone || undefined,
        role: (roleFromRolesTable ?? (data.role as UserRole)) as UserRole,
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

  const fetchUserProfileWithRetry = async (userId: string, attempts = 3): Promise<User | null> => {
    let lastError: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        const profile = await fetchUserProfile(userId);
        if (profile) return profile;

        lastError = new Error('Profile not found');
      } catch (err) {
        lastError = err;
      }

      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    console.error('Error fetching user profile after retries:', lastError);
    return null;
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

  // Track whether initial hydration is complete to avoid loading flash on token refresh
  const initialLoadDone = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  // Initialize auth state
  useEffect(() => {
    let requestId = 0;
    let isUnmounted = false;

    const hydrateFromSession = async (newSession: Session | null) => {
      const currentRequest = ++requestId;

      sessionRef.current = newSession;
      setSession(newSession);

      if (!newSession?.user) {
        setUser(null);
        setNotifications([]);
        setIsLoading(false);
        initialLoadDone.current = true;
        return;
      }

      setIsLoading(true);

      try {
        await initializeCache();
      } catch (e) {
        console.error('Error initializing cache:', e);
      }

      const profile = await fetchUserProfileWithRetry(newSession.user.id);

      if (isUnmounted || currentRequest !== requestId) return;

      if (!profile) {
        setUser(null);
        setNotifications([]);
        setIsLoading(false);
        initialLoadDone.current = true;
        await supabase.auth.signOut();
        return;
      }

      if (profile.status !== 'active') {
        setUser(null);
        setNotifications([]);
        setIsLoading(false);
        initialLoadDone.current = true;
        await supabase.auth.signOut();
        return;
      }

      setUser(profile);
      await loadNotifications(newSession.user.id);
      setIsLoading(false);
      initialLoadDone.current = true;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setTimeout(() => {
        const prevUserId = sessionRef.current?.user?.id;
        const nextUserId = newSession?.user?.id;

        if (import.meta.env.DEV) {
          console.log('[auth] onAuthStateChange', {
            event,
            initialLoadDone: initialLoadDone.current,
            prevUserId,
            nextUserId,
          });
        }

        if (initialLoadDone.current && prevUserId && nextUserId === prevUserId && event !== 'SIGNED_OUT') {
          if (import.meta.env.DEV) {
            console.log('[auth] session-only update');
          }
          sessionRef.current = newSession;
          setSession(newSession);
          return;
        }

        if (import.meta.env.DEV) {
          console.log('[auth] hydrate');
        }
        void hydrateFromSession(newSession);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      void hydrateFromSession(existingSession);
    });

    return () => {
      isUnmounted = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (!data.user) {
        setIsLoading(false);
        return { success: false, error: 'Login failed' };
      }

      sessionRef.current = data.session;
      setSession(data.session);

      try {
        await initializeCache();
      } catch (e) {
        console.error('Error initializing cache:', e);
      }

      // Fetch user profile to verify they exist in our users table
      const profile = await fetchUserProfileWithRetry(data.user.id);
      
      if (!profile) {
        // User exists in auth but not in our users table
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return { success: false, error: 'User account not found. Please contact an administrator.' };
      }

      if (profile.status !== 'active') {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return { success: false, error: 'Account is inactive' };
      }

      setUser(profile);
      loadNotifications(data.user.id);

      // Update last login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      setIsLoading(false);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    sessionRef.current = null;
    setSession(null);
    setNotifications([]);
    
    // Clear all React Query cache to prevent data leakage between sessions
    queryClient.clear();
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
