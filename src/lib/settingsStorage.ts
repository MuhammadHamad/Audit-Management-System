// ============= SETTINGS STORAGE =============

const SETTINGS_KEY = 'burgerizzr_system_settings';

export interface HealthScoreWeights {
  branch: {
    audit_performance: number;
    capa_completion: number;
    repeat_findings: number;
    incident_rate: number;
    verification_pass: number;
  };
  bck: {
    haccp_compliance: number;
    production_audit_perf: number;
    supplier_quality: number;
    capa_completion: number;
  };
  supplier: {
    audit_performance: number;
    product_quality: number;
    compliance: number;
    delivery_perf: number;
  };
}

export interface NotificationPreference {
  type: string;
  label: string;
  roles: string[];
  editable: boolean;
}

export interface PasswordPolicy {
  requirePasswordChangeOnFirstLogin: boolean;
  enforceStrongPasswords: boolean;
  sessionTimeoutDays: number;
}

export interface SystemSettings {
  healthScoreWeights: HealthScoreWeights;
  notificationPreferences: NotificationPreference[];
  passwordPolicy: PasswordPolicy;
}

export const defaultHealthScoreWeights: HealthScoreWeights = {
  branch: {
    audit_performance: 40,
    capa_completion: 25,
    repeat_findings: 15,
    incident_rate: 10,
    verification_pass: 10,
  },
  bck: {
    haccp_compliance: 50,
    production_audit_perf: 25,
    supplier_quality: 15,
    capa_completion: 10,
  },
  supplier: {
    audit_performance: 40,
    product_quality: 30,
    compliance: 20,
    delivery_perf: 10,
  },
};

export const defaultNotificationPreferences: NotificationPreference[] = [
  { 
    type: 'capa_assigned', 
    label: 'CAPA Assigned', 
    roles: ['branch_manager', 'bck_manager', 'audit_manager'], 
    editable: false 
  },
  { 
    type: 'audit_approved', 
    label: 'Audit Approved', 
    roles: ['branch_manager', 'bck_manager'], 
    editable: false 
  },
  { 
    type: 'capa_rejected', 
    label: 'CAPA Rejected', 
    roles: ['branch_manager', 'bck_manager'], 
    editable: false 
  },
  { 
    type: 'incident_critical', 
    label: 'Incident Critical', 
    roles: ['regional_manager', 'audit_manager'], 
    editable: true 
  },
  { 
    type: 'supplier_suspended', 
    label: 'Supplier Suspended', 
    roles: ['audit_manager'], 
    editable: false 
  },
  { 
    type: 'task_assigned', 
    label: 'Task Assigned', 
    roles: ['staff'], 
    editable: false 
  },
  { 
    type: 'capa_escalated', 
    label: 'CAPA Escalated', 
    roles: ['regional_manager', 'audit_manager'], 
    editable: true 
  },
];

export const defaultPasswordPolicy: PasswordPolicy = {
  requirePasswordChangeOnFirstLogin: true,
  enforceStrongPasswords: true,
  sessionTimeoutDays: 7,
};

export const getSystemSettings = (): SystemSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (data) {
    return JSON.parse(data);
  }
  return {
    healthScoreWeights: defaultHealthScoreWeights,
    notificationPreferences: defaultNotificationPreferences,
    passwordPolicy: defaultPasswordPolicy,
  };
};

export const saveSystemSettings = (settings: SystemSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getHealthScoreWeights = (): HealthScoreWeights => {
  return getSystemSettings().healthScoreWeights;
};

export const saveHealthScoreWeights = (weights: HealthScoreWeights): void => {
  const settings = getSystemSettings();
  settings.healthScoreWeights = weights;
  saveSystemSettings(settings);
};

export const getNotificationPreferences = (): NotificationPreference[] => {
  return getSystemSettings().notificationPreferences;
};

export const saveNotificationPreferences = (prefs: NotificationPreference[]): void => {
  const settings = getSystemSettings();
  settings.notificationPreferences = prefs;
  saveSystemSettings(settings);
};

export const getPasswordPolicy = (): PasswordPolicy => {
  return getSystemSettings().passwordPolicy;
};

export const savePasswordPolicy = (policy: PasswordPolicy): void => {
  const settings = getSystemSettings();
  settings.passwordPolicy = policy;
  saveSystemSettings(settings);
};
