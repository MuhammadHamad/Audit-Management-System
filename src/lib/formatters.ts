import { formatDistanceToNow, format, isValid } from 'date-fns';

/**
 * Format a date as a relative timestamp (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return 'Never';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!isValid(dateObj)) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // After 7 days, show absolute date
    return format(dateObj, 'MMM dd, yyyy');
  } catch {
    return 'Never';
  }
}

/**
 * Format a date in short format (e.g., "Feb 10, 2026")
 */
export function formatShortDate(date: Date | string | undefined): string {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!isValid(dateObj)) return '—';
    return format(dateObj, 'MMM dd, yyyy');
  } catch {
    return '—';
  }
}

/**
 * Format a date in long format (e.g., "February 10, 2026 at 2:30 PM")
 */
export function formatLongDateTime(date: Date | string | undefined): string {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!isValid(dateObj)) return '—';
    return format(dateObj, "MMMM dd, yyyy 'at' h:mm a");
  } catch {
    return '—';
  }
}

/**
 * Format a date for display with relative time and hover for absolute
 */
export function formatDisplayDate(date: Date | string | undefined): {
  relative: string;
  absolute: string;
} {
  if (!date) return { relative: 'Never', absolute: '—' };
  
  return {
    relative: formatRelativeTime(date),
    absolute: formatLongDateTime(date),
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Truncate email in the middle (e.g., "verylongemail...@domain.com")
 */
export function truncateEmail(email: string, maxLength: number = 30): string {
  if (!email) return '';
  if (email.length <= maxLength) return email;
  
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return truncateText(email, maxLength);
  
  const domain = email.slice(atIndex);
  const localPart = email.slice(0, atIndex);
  
  const availableForLocal = maxLength - domain.length - 3; // 3 for "..."
  if (availableForLocal < 3) return truncateText(email, maxLength);
  
  return localPart.slice(0, availableForLocal) + '...' + domain;
}
