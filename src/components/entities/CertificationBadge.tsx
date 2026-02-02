import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Certification } from '@/types';

interface CertificationBadgeProps {
  certifications: Certification[] | string[];
}

export function CertificationBadge({ certifications }: CertificationBadgeProps) {
  if (!certifications || certifications.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  // Handle both formats: array of strings or array of objects
  const certsArray = certifications.map((cert) => {
    if (typeof cert === 'string') {
      return { name: cert, expiry_date: undefined };
    }
    return cert;
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const hasExpiringCerts = certsArray.some((cert) => {
    if (!cert.expiry_date) return false;
    const expiryDate = new Date(cert.expiry_date);
    return expiryDate <= thirtyDaysFromNow;
  });

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
          'bg-muted text-muted-foreground border-border'
        )}
      >
        {certsArray.length} cert{certsArray.length !== 1 ? 's' : ''}
      </span>
      {hasExpiringCerts && (
        <AlertTriangle className="h-4 w-4 text-warning" />
      )}
    </div>
  );
}
