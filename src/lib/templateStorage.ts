import { User } from '@/types';

export interface TemplateItem {
  id: string;
  text: string;
  type: 'pass_fail' | 'rating' | 'numeric' | 'photo' | 'text' | 'checklist';
  points: number;
  evidence_required: 'none' | 'optional' | 'required_1' | 'required_2';
  critical: boolean;
  help_text: string;
  order: number;
}

export interface TemplateSection {
  id: string;
  name: string;
  weight: number;
  order: number;
  items: TemplateItem[];
}

export interface ChecklistJson {
  sections: TemplateSection[];
}

export interface ScoringConfig {
  pass_threshold: number;
  critical_fail_rule: boolean;
  weighted: boolean;
}

export type TemplateStatus = 'draft' | 'active' | 'archived';
export type EntityType = 'branch' | 'bck' | 'supplier';

export interface AuditTemplate {
  id: string;
  name: string;
  code: string;
  type?: string;
  entity_type: EntityType;
  version: number;
  status: TemplateStatus;
  checklist_json: ChecklistJson;
  scoring_config: ScoringConfig;
  languages?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATES_KEY = 'audit_templates';

// Seed templates
const seedTemplates: Omit<AuditTemplate, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: "Branch Daily Hygiene",
    code: "TPL-BR-DAILY",
    entity_type: "branch",
    status: "active",
    version: 1,
    created_by: "system",
    scoring_config: { pass_threshold: 70, critical_fail_rule: true, weighted: true },
    checklist_json: {
      sections: [
        {
          id: crypto.randomUUID(),
          name: "Floor & Surface Cleanliness",
          weight: 40,
          order: 1,
          items: [
            { id: crypto.randomUUID(), text: "Are all floors clean and free of debris?", type: "pass_fail", points: 10, critical: true, evidence_required: "none", help_text: "Check dining area, kitchen, and entrances", order: 1 },
            { id: crypto.randomUUID(), text: "Are counter surfaces sanitized?", type: "pass_fail", points: 8, critical: true, evidence_required: "none", help_text: "", order: 2 },
            { id: crypto.randomUUID(), text: "Are tables and chairs clean?", type: "pass_fail", points: 7, critical: false, evidence_required: "none", help_text: "", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Food Safety",
          weight: 40,
          order: 2,
          items: [
            { id: crypto.randomUUID(), text: "Are hot items stored above 60°C?", type: "numeric", points: 10, critical: true, evidence_required: "none", help_text: "Use thermometer. Record actual temperature.", order: 1 },
            { id: crypto.randomUUID(), text: "Are cold items stored below 5°C?", type: "numeric", points: 10, critical: true, evidence_required: "none", help_text: "Check refrigerators and cold display cases.", order: 2 },
            { id: crypto.randomUUID(), text: "Are food items properly labeled with dates?", type: "pass_fail", points: 8, critical: true, evidence_required: "none", help_text: "", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Staff Hygiene",
          weight: 20,
          order: 3,
          items: [
            { id: crypto.randomUUID(), text: "Are staff wearing clean uniforms?", type: "pass_fail", points: 5, critical: false, evidence_required: "none", help_text: "", order: 1 },
            { id: crypto.randomUUID(), text: "Are handwashing stations stocked and accessible?", type: "pass_fail", points: 7, critical: true, evidence_required: "required_1", help_text: "Photo of each handwashing station", order: 2 }
          ]
        }
      ]
    }
  },
  {
    name: "BCK HACCP Monthly",
    code: "TPL-BCK-HACCP",
    entity_type: "bck",
    status: "active",
    version: 1,
    created_by: "system",
    scoring_config: { pass_threshold: 80, critical_fail_rule: true, weighted: true },
    checklist_json: {
      sections: [
        {
          id: crypto.randomUUID(),
          name: "Critical Control Points",
          weight: 50,
          order: 1,
          items: [
            { id: crypto.randomUUID(), text: "Are all CCP temperature logs complete for the last 30 days?", type: "pass_fail", points: 15, critical: true, evidence_required: "required_1", help_text: "All 7 CCPs must have complete logs", order: 1 },
            { id: crypto.randomUUID(), text: "Are corrective actions documented for any CCP deviations?", type: "pass_fail", points: 12, critical: true, evidence_required: "required_1", help_text: "", order: 2 },
            { id: crypto.randomUUID(), text: "What is the current cooking temperature for poultry?", type: "numeric", points: 10, critical: true, evidence_required: "none", help_text: "Must be above 74°C", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Sanitation & Hygiene",
          weight: 30,
          order: 2,
          items: [
            { id: crypto.randomUUID(), text: "Are production lines clean before shift start?", type: "pass_fail", points: 10, critical: true, evidence_required: "required_2", help_text: "Photo before and after cleaning", order: 1 },
            { id: crypto.randomUUID(), text: "Are sanitation chemicals stored correctly and labeled?", type: "pass_fail", points: 8, critical: true, evidence_required: "none", help_text: "", order: 2 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Documentation",
          weight: 20,
          order: 3,
          items: [
            { id: crypto.randomUUID(), text: "Is the HACCP plan current and accessible?", type: "pass_fail", points: 8, critical: true, evidence_required: "none", help_text: "", order: 1 },
            { id: crypto.randomUUID(), text: "Are staff training records up to date?", type: "pass_fail", points: 7, critical: false, evidence_required: "none", help_text: "", order: 2 }
          ]
        }
      ]
    }
  },
  {
    name: "Supplier Initial Approval",
    code: "TPL-SUP-APPROVAL",
    entity_type: "supplier",
    status: "active",
    version: 1,
    created_by: "system",
    scoring_config: { pass_threshold: 80, critical_fail_rule: true, weighted: true },
    checklist_json: {
      sections: [
        {
          id: crypto.randomUUID(),
          name: "Facility Assessment",
          weight: 25,
          order: 1,
          items: [
            { id: crypto.randomUUID(), text: "Is the facility clean and well-maintained?", type: "pass_fail", points: 10, critical: true, evidence_required: "required_2", help_text: "Photo of main production area and storage", order: 1 },
            { id: crypto.randomUUID(), text: "Is pest control program active and documented?", type: "pass_fail", points: 8, critical: true, evidence_required: "required_1", help_text: "", order: 2 },
            { id: crypto.randomUUID(), text: "Are waste disposal systems adequate?", type: "pass_fail", points: 7, critical: false, evidence_required: "none", help_text: "", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Documentation & Certifications",
          weight: 25,
          order: 2,
          items: [
            { id: crypto.randomUUID(), text: "Are all required licenses and permits valid?", type: "pass_fail", points: 10, critical: true, evidence_required: "required_1", help_text: "Check expiry dates on all documents", order: 1 },
            { id: crypto.randomUUID(), text: "Does the supplier have HACCP certification?", type: "pass_fail", points: 10, critical: true, evidence_required: "required_1", help_text: "", order: 2 },
            { id: crypto.randomUUID(), text: "Is Halal certification current?", type: "pass_fail", points: 8, critical: true, evidence_required: "required_1", help_text: "", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Production & Quality Control",
          weight: 30,
          order: 3,
          items: [
            { id: crypto.randomUUID(), text: "Are production processes properly documented?", type: "pass_fail", points: 10, critical: true, evidence_required: "none", help_text: "", order: 1 },
            { id: crypto.randomUUID(), text: "What is the facility's traceability system?", type: "text", points: 8, critical: true, evidence_required: "none", help_text: "Describe how they track batches from raw material to finished product", order: 2 },
            { id: crypto.randomUUID(), text: "Are quality control tests performed regularly?", type: "pass_fail", points: 7, critical: false, evidence_required: "none", help_text: "", order: 3 }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Storage & Transportation",
          weight: 20,
          order: 4,
          items: [
            { id: crypto.randomUUID(), text: "Are storage conditions appropriate for product type?", type: "pass_fail", points: 8, critical: true, evidence_required: "required_1", help_text: "Check temperature in cold storage", order: 1 },
            { id: crypto.randomUUID(), text: "Are transportation vehicles clean and temperature-controlled?", type: "pass_fail", points: 7, critical: false, evidence_required: "none", help_text: "", order: 2 }
          ]
        }
      ]
    }
  }
];

export function initializeTemplateStorage(): void {
  const existing = localStorage.getItem(TEMPLATES_KEY);
  if (!existing) {
    const now = new Date().toISOString();
    const templates: AuditTemplate[] = seedTemplates.map(template => ({
      ...template,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }));
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  }
}

export function getTemplates(): AuditTemplate[] {
  initializeTemplateStorage();
  const data = localStorage.getItem(TEMPLATES_KEY);
  return data ? JSON.parse(data) : [];
}

export function getTemplateById(id: string): AuditTemplate | undefined {
  const templates = getTemplates();
  return templates.find(t => t.id === id);
}

export function getTemplateByCode(code: string): AuditTemplate | undefined {
  const templates = getTemplates();
  return templates.find(t => t.code === code);
}

export function createTemplate(template: Omit<AuditTemplate, 'id' | 'created_at' | 'updated_at'>): AuditTemplate {
  const templates = getTemplates();
  const now = new Date().toISOString();
  const newTemplate: AuditTemplate = {
    ...template,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };
  templates.push(newTemplate);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  return newTemplate;
}

export function updateTemplate(id: string, updates: Partial<AuditTemplate>): AuditTemplate | null {
  const templates = getTemplates();
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) return null;
  
  const updated: AuditTemplate = {
    ...templates[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  templates[index] = updated;
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  return updated;
}

export function duplicateTemplate(id: string): AuditTemplate | null {
  const template = getTemplateById(id);
  if (!template) return null;
  
  // Generate new code
  let newCode = `${template.code}-COPY`;
  let counter = 1;
  while (getTemplateByCode(newCode)) {
    newCode = `${template.code}-COPY-${counter}`;
    counter++;
  }
  
  // Deep clone checklist_json with new IDs
  const newChecklist: ChecklistJson = {
    sections: template.checklist_json.sections.map(section => ({
      ...section,
      id: crypto.randomUUID(),
      items: section.items.map(item => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    })),
  };
  
  return createTemplate({
    name: `${template.name} (Copy)`,
    code: newCode,
    entity_type: template.entity_type,
    version: 1,
    status: 'draft',
    checklist_json: newChecklist,
    scoring_config: { ...template.scoring_config },
    created_by: template.created_by,
  });
}

export function deleteTemplate(id: string): boolean {
  const templates = getTemplates();
  const template = templates.find(t => t.id === id);
  if (!template || template.status !== 'draft') return false;
  
  const filtered = templates.filter(t => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(filtered));
  return true;
}

export function archiveTemplate(id: string): AuditTemplate | null {
  return updateTemplate(id, { status: 'archived' });
}

export function activateTemplate(id: string): AuditTemplate | null {
  return updateTemplate(id, { status: 'active' });
}

// Create a new version of an active template
export function createNewVersion(id: string, updates: Partial<AuditTemplate>): AuditTemplate | null {
  const template = getTemplateById(id);
  if (!template) return null;
  
  // Update the old template to keep history (just increment version for the new one)
  return updateTemplate(id, {
    ...updates,
    version: template.version + 1,
    updated_at: new Date().toISOString(),
  });
}

// Helper to get total items count
export function getTotalItemsCount(template: AuditTemplate): number {
  return template.checklist_json.sections.reduce((acc, section) => acc + section.items.length, 0);
}

// Helper to calculate estimated time
export function getEstimatedTime(template: AuditTemplate): number {
  let minutes = 0;
  for (const section of template.checklist_json.sections) {
    for (const item of section.items) {
      if (item.type === 'pass_fail') {
        minutes += 1;
      } else if (['rating', 'numeric', 'text'].includes(item.type)) {
        minutes += 2;
      } else if (['photo', 'checklist'].includes(item.type)) {
        minutes += 3;
      }
    }
  }
  return minutes;
}
