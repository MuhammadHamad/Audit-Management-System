import { UserRole } from '@/types';

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigationConfig: NavSection[] = [
  {
    title: 'SYSTEM',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: 'LayoutDashboard',
        roles: ['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff'],
      },
      {
        title: 'Users',
        href: '/users',
        icon: 'Users',
        roles: ['super_admin'],
      },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      {
        title: 'Branches',
        href: '/branches',
        icon: 'MapPin',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'BCKs',
        href: '/bcks',
        icon: 'Factory',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'Suppliers',
        href: '/suppliers',
        icon: 'Truck',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'Regions',
        href: '/regions',
        icon: 'Map',
        roles: ['super_admin'],
      },
    ],
  },
  {
    title: 'AUDIT PROGRAM',
    items: [
      {
        title: 'Templates',
        href: '/templates',
        icon: 'FileText',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'Audit Plans',
        href: '/audit-plans',
        icon: 'CalendarDays',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'Audits',
        href: '/audits',
        icon: 'ClipboardCheck',
        roles: ['super_admin', 'audit_manager', 'regional_manager', 'auditor'],
      },
      {
        title: 'CAPA',
        href: '/capa',
        icon: 'CheckCircle',
        roles: ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager', 'staff'],
      },
      {
        title: 'Incidents',
        href: '/incidents',
        icon: 'AlertTriangle',
        roles: ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager'],
      },
    ],
  },
  {
    title: 'REPORTS',
    items: [
      {
        title: 'Analytics',
        href: '/analytics',
        icon: 'TrendingUp',
        roles: ['super_admin', 'audit_manager'],
      },
      {
        title: 'Reports',
        href: '/reports',
        icon: 'BarChart3',
        roles: ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager'],
      },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      {
        title: 'Settings',
        href: '/settings',
        icon: 'Settings',
        roles: ['super_admin'],
      },
    ],
  },
];

// Route access configuration
export const routeAccess: Record<string, UserRole[]> = {
  '/dashboard': ['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff'],
  '/users': ['super_admin'],
  '/branches': ['super_admin', 'audit_manager'],
  '/bcks': ['super_admin', 'audit_manager'],
  '/suppliers': ['super_admin', 'audit_manager'],
  '/regions': ['super_admin'],
  '/templates': ['super_admin', 'audit_manager'],
  '/audit-plans': ['super_admin', 'audit_manager'],
  '/audits': ['super_admin', 'audit_manager', 'regional_manager', 'auditor'],
  '/audits/pending-verification': ['super_admin', 'audit_manager', 'regional_manager'],
  '/capa': ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager', 'staff'],
  '/incidents': ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager'],
  '/analytics': ['super_admin', 'audit_manager'],
  '/reports': ['super_admin', 'audit_manager', 'regional_manager', 'branch_manager', 'bck_manager'],
  '/settings': ['super_admin'],
  '/profile': ['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff'],
  '/notifications': ['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff'],
};
