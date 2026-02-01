import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Notification } from '@/types';
import { seedUsers, seedNotifications, userCredentials } from '@/data/seedData';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  notifications: Notification[];
  unreadCount: number;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'burgerizzr_auth';
const NOTIFICATIONS_KEY = 'burgerizzr_notifications';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Initialize data on mount
  useEffect(() => {
    const storedUser = localStorage.getItem(STORAGE_KEY);
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        loadNotifications(parsedUser.id);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const loadNotifications = (userId: string) => {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    if (stored) {
      const allNotifications: Notification[] = JSON.parse(stored);
      setNotifications(allNotifications.filter(n => n.user_id === userId));
    } else {
      // Initialize with seed notifications
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(seedNotifications));
      setNotifications(seedNotifications.filter(n => n.user_id === userId));
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const storedPassword = userCredentials[email.toLowerCase()];
    if (!storedPassword || storedPassword !== password) {
      return { success: false, error: 'Invalid email or password' };
    }

    const foundUser = seedUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!foundUser) {
      return { success: false, error: 'User not found' };
    }

    if (foundUser.status !== 'active') {
      return { success: false, error: 'Account is inactive' };
    }

    const loggedInUser = {
      ...foundUser,
      last_login_at: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    loadNotifications(loggedInUser.id);

    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setNotifications([]);
  };

  const markAllAsRead = () => {
    if (!user) return;
    
    const allNotifications: Notification[] = JSON.parse(
      localStorage.getItem(NOTIFICATIONS_KEY) || '[]'
    );
    
    const updated = allNotifications.map(n => 
      n.user_id === user.id ? { ...n, read: true } : n
    );
    
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    setNotifications(updated.filter(n => n.user_id === user.id));
  };

  const markAsRead = (id: string) => {
    if (!user) return;
    
    const allNotifications: Notification[] = JSON.parse(
      localStorage.getItem(NOTIFICATIONS_KEY) || '[]'
    );
    
    const updated = allNotifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    setNotifications(updated.filter(n => n.user_id === user.id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
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
