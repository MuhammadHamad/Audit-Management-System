import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { fetchAuditById } from '@/lib/auditSupabase';
import { fetchTemplateById } from '@/lib/templateSupabase';
import {
  createSignedAuditEvidenceUrls,
  createSignedCAPAEvidenceUrls,
  fetchAuditResults,
  fetchCAPAById,
  fetchFindingById,
} from '@/lib/executionSupabase';
import { fetchCAPAActivitiesByCAPAId } from '@/lib/verificationSupabase';

type EntityInfo = { name: string; code: string; type: string } | null;

type UserRow = { id: string; full_name: string | null };

type TemplateItem = { id: string; text?: string; title?: string; points?: number; maxPoints?: number };

type TemplateSection = { id: string; name?: string; title?: string; items?: TemplateItem[] };

type AuditItemResponse =
  | { value: 'pass' | 'fail' }
  | { value: number }
  | { value: string }
  | { value: Record<string, boolean> }
  | { value: null };

type AuditResultRow = {
  audit_id: string;
  section_id: string;
  item_id: string;
  response: AuditItemResponse;
  evidence_urls: string[];
  points_earned: number;
  created_at?: string;
  updated_at?: string;
};

type ExportBundle = {
  capa: any;
  audit: any | null;
  finding: any | null;
  template: any | null;
  auditResults: AuditResultRow[];
  activities: any[];
  entityInfo: EntityInfo;
  userNameById: (id?: string | null) => string;
  signedCapaEvidenceUrls: string[];
  signedFindingEvidenceUrls: string[];
  signedAuditEvidenceByItemId: Record<string, string[]>;
};

const isLikelyStoragePath = (s: string): boolean => {
  if (!s) return false;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return false;
  return true;
};

const trySignEvidencePaths = async (paths: string[]): Promise<string[]> => {
  if (paths.length === 0) return [];
  try {
    return await createSignedCAPAEvidenceUrls(paths);
  } catch {
    try {
      return await createSignedAuditEvidenceUrls(paths);
    } catch {
      return paths;
    }
  }
};

const replaceStoragePathsWithSignedUrls = (originals: string[], signed: string[]): string[] => {
  let si = 0;
  return originals.map((u) => {
    if (!isLikelyStoragePath(u)) return u;
    const next = signed[si];
    si += 1;
    return next || u;
  });
};

const formatResponse = (response: AuditItemResponse | null | undefined): string => {
  if (!response || typeof response !== 'object' || !('value' in response)) return '—';
  const v: any = (response as any).value;
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k]).sort();
    return keys.length ? keys.join(', ') : '—';
  }
  return String(v);
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
};

const getEntityInfo = async (entityType: string | null | undefined, entityId: string | null | undefined): Promise<EntityInfo> => {
  if (!entityType || !entityId) return null;

  if (entityType === 'branch') {
    const { data } = await supabase.from('branches').select('name,code').eq('id', entityId).maybeSingle();
    return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'Branch' } : null;
  }

  if (entityType === 'bck') {
    const { data } = await supabase.from('bcks').select('name,code').eq('id', entityId).maybeSingle();
    return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'BCK' } : null;
  }

  if (entityType === 'supplier') {
    const { data } = await supabase.from('suppliers').select('name,code').eq('id', entityId).maybeSingle();
    return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'Supplier' } : null;
  }

  return null;
};

const fetchUserNameMap = async (userIds: string[]): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.from('users').select('id,full_name').in('id', unique);
  if (error) throw error;

  const map = new Map<string, string>();
  (data as UserRow[] | null | undefined)?.forEach((u) => {
    map.set(u.id, u.full_name || 'Unknown');
  });
  return map;
};

const extractTemplateSections = (template: any | null): TemplateSection[] => {
  const checklist = template?.checklist_json;
  const sections = checklist?.sections;
  if (!Array.isArray(sections)) return [];
  return sections as TemplateSection[];
};

const findTemplateItem = (
  templateSections: TemplateSection[],
  sectionId: string,
  itemId: string,
): { sectionName: string; itemText: string; maxPoints?: number } => {
  const section = templateSections.find((s) => s.id === sectionId);
  const sectionName = (section?.name || section?.title || 'Unknown Section') as string;
  const item = section?.items?.find((i) => i.id === itemId);
  const itemText = (item?.text || item?.title || 'Unknown Item') as string;
  const maxPoints = typeof item?.maxPoints === 'number' ? item?.maxPoints : typeof item?.points === 'number' ? item?.points : undefined;
  return { sectionName, itemText, maxPoints };
};

export async function buildCAPAExportBundle(capaId: string): Promise<ExportBundle> {
  const capa = await fetchCAPAById(capaId);
  if (!capa) throw new Error('CAPA not found');

  const [audit, finding, activities] = await Promise.all([
    capa.audit_id ? fetchAuditById(capa.audit_id).catch(() => null) : Promise.resolve(null),
    capa.finding_id ? fetchFindingById(capa.finding_id).catch(() => null) : Promise.resolve(null),
    fetchCAPAActivitiesByCAPAId(capaId).catch(() => []),
  ]);

  const [auditResults, template] = await Promise.all([
    capa.audit_id ? fetchAuditResults(capa.audit_id).catch(() => []) : Promise.resolve([]),
    audit?.template_id ? fetchTemplateById(audit.template_id).catch(() => null) : Promise.resolve(null),
  ]);

  const entityType = (audit?.entity_type ?? capa.entity_type) as string | undefined;
  const entityId = (audit?.entity_id ?? capa.entity_id) as string | undefined;
  const entityInfo = await getEntityInfo(entityType, entityId);

  const userIds: string[] = [
    capa.assigned_to,
    capa.escalated_to_user_id,
    audit?.auditor_id,
    ...((activities || []).map((a: any) => a.user_id) as string[]),
  ];

  const userMap = await fetchUserNameMap(userIds);
  const userNameById = (id?: string | null) => (id ? userMap.get(id) || 'Unknown' : '');

  const capaPaths = Array.isArray(capa.evidence_urls) ? (capa.evidence_urls as string[]) : [];
  const capaSignPaths = capaPaths.filter(isLikelyStoragePath);
  const signedCapaEvidenceSigned = capaSignPaths.length ? await trySignEvidencePaths(capaSignPaths) : [];
  const signedCapaEvidenceUrls = capaSignPaths.length
    ? replaceStoragePathsWithSignedUrls(capaPaths, signedCapaEvidenceSigned)
    : capaPaths;

  const findingPaths = Array.isArray(finding?.evidence_urls) ? (finding!.evidence_urls as string[]) : [];
  const findingSignPaths = findingPaths.filter(isLikelyStoragePath);
  const signedFindingEvidenceSigned = findingSignPaths.length ? await trySignEvidencePaths(findingSignPaths) : [];
  const signedFindingEvidenceUrls = findingSignPaths.length
    ? replaceStoragePathsWithSignedUrls(findingPaths, signedFindingEvidenceSigned)
    : findingPaths;

  const signedAuditEvidenceByItemId: Record<string, string[]> = {};
  const allAuditSignPaths: string[] = [];
  const perItem: Array<{ item_id: string; originals: string[]; signCount: number }> = [];

  for (const r of auditResults as any[]) {
    const originals = Array.isArray(r.evidence_urls) ? (r.evidence_urls as string[]) : [];
    const signable = originals.filter(isLikelyStoragePath);
    perItem.push({ item_id: r.item_id, originals, signCount: signable.length });
    allAuditSignPaths.push(...signable);
  }

  const signedAllAudit = allAuditSignPaths.length ? await createSignedAuditEvidenceUrls(allAuditSignPaths) : [];
  let ai = 0;
  for (const row of perItem) {
    const signedSlice = signedAllAudit.slice(ai, ai + row.signCount);
    ai += row.signCount;
    signedAuditEvidenceByItemId[row.item_id] = row.signCount
      ? replaceStoragePathsWithSignedUrls(row.originals, signedSlice)
      : row.originals;
  }

  return {
    capa,
    audit,
    finding,
    template,
    auditResults: (auditResults as any[]) || [],
    activities: (activities as any[]) || [],
    entityInfo,
    userNameById,
    signedCapaEvidenceUrls,
    signedFindingEvidenceUrls,
    signedAuditEvidenceByItemId,
  };
}

export function exportCAPAReportToExcel(bundle: ExportBundle): void {
  const { capa, audit, finding, template, auditResults, activities, entityInfo, userNameById } = bundle;
  const templateSections = extractTemplateSections(template);

  const wb = XLSX.utils.book_new();

  const overviewRows = [
    {
      field: 'CAPA Code',
      value: capa.capa_code,
    },
    {
      field: 'Status',
      value: capa.status,
    },
    {
      field: 'Priority',
      value: capa.priority,
    },
    {
      field: 'Entity',
      value: entityInfo ? `${entityInfo.code} - ${entityInfo.name} (${entityInfo.type})` : '',
    },
    {
      field: 'Due Date',
      value: capa.due_date,
    },
    {
      field: 'Assigned To',
      value: userNameById(capa.assigned_to),
    },
    {
      field: 'Created At',
      value: formatDate(capa.created_at),
    },
    {
      field: 'Updated At',
      value: formatDate(capa.updated_at),
    },
    {
      field: 'Description',
      value: capa.description,
    },
    {
      field: 'Corrective Action Taken',
      value: capa.notes || '',
    },
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), 'CAPA');

  const auditRows = audit
    ? [
        {
          audit_code: audit.audit_code,
          status: audit.status,
          scheduled_date: audit.scheduled_date,
          started_at: audit.started_at || '',
          completed_at: audit.completed_at || '',
          score: audit.score ?? '',
          pass_fail: audit.pass_fail ?? '',
          auditor: userNameById(audit.auditor_id),
          template_id: audit.template_id,
        },
      ]
    : [];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditRows), 'Audit');

  const findingRows = finding
    ? [
        {
          finding_code: finding.finding_code,
          severity: finding.severity,
          status: finding.status,
          section_name: finding.section_name,
          category: finding.category,
          description: finding.description,
        },
      ]
    : [];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(findingRows), 'Finding');

  const checklistRows = (auditResults || []).map((r: any) => {
    const meta = findTemplateItem(templateSections, r.section_id, r.item_id);
    return {
      section: meta.sectionName,
      item: meta.itemText,
      response: formatResponse(r.response),
      points_earned: r.points_earned ?? '',
      max_points: meta.maxPoints ?? '',
      evidence_count: Array.isArray(r.evidence_urls) ? r.evidence_urls.length : 0,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checklistRows), 'Checklist');

  const evidenceRows: Array<{ type: string; item_id?: string; url: string }> = [];

  for (const url of bundle.signedCapaEvidenceUrls || []) {
    evidenceRows.push({ type: 'CAPA', url });
  }

  for (const url of bundle.signedFindingEvidenceUrls || []) {
    evidenceRows.push({ type: 'Finding', url });
  }

  for (const [itemId, urls] of Object.entries(bundle.signedAuditEvidenceByItemId || {})) {
    for (const url of urls) {
      evidenceRows.push({ type: 'Audit Item', item_id: itemId, url });
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evidenceRows), 'Evidence');

  const activityRows = (activities || []).map((a: any) => ({
    created_at: a.created_at ? formatDate(a.created_at) : '',
    action: a.action || '',
    user: userNameById(a.user_id),
    details: a.details || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityRows), 'Activity');

  const filename = `${capa.capa_code || 'CAPA'}_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function openCAPAReportPrintView(bundle: ExportBundle): void {
  const { capa, audit, finding, entityInfo, auditResults, activities, userNameById } = bundle;
  const templateSections = extractTemplateSections(bundle.template);

  const checklistHtml = (auditResults || [])
    .map((r: any) => {
      const meta = findTemplateItem(templateSections, r.section_id, r.item_id);
      const evidence = (bundle.signedAuditEvidenceByItemId?.[r.item_id] || [])
        .slice(0, 6)
        .map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="evidence" />`)
        .join('');

      return `
        <div class="row">
          <div class="row-head">
            <div class="sec">${escapeHtml(meta.sectionName)}</div>
            <div class="pts">${escapeHtml(String(r.points_earned ?? ''))}${meta.maxPoints != null ? ` / ${escapeHtml(String(meta.maxPoints))}` : ''}</div>
          </div>
          <div class="item">${escapeHtml(meta.itemText)}</div>
          <div class="meta">Response: <b>${escapeHtml(formatResponse(r.response))}</b></div>
          ${evidence ? `<div class="grid">${evidence}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const capaEvidenceHtml = (bundle.signedCapaEvidenceUrls || [])
    .slice(0, 12)
    .map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="capa-evidence" />`)
    .join('');

  const findingEvidenceHtml = (bundle.signedFindingEvidenceUrls || [])
    .slice(0, 12)
    .map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="finding-evidence" />`)
    .join('');

  const activityHtml = (activities || [])
    .slice()
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((a: any) => {
      return `<div class="activity">
        <div class="activity-top">
          <div><b>${escapeHtml(a.action || '')}</b></div>
          <div class="muted">${escapeHtml(formatDate(a.created_at))}</div>
        </div>
        <div class="muted">${escapeHtml(userNameById(a.user_id))}</div>
        ${a.details ? `<div class="details">${escapeHtml(a.details)}</div>` : ''}
      </div>`;
    })
    .join('');

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${escapeHtml(capa.capa_code || 'CAPA Report')}</title>
        <style>
          :root { --muted: #64748b; --border: #e2e8f0; }
          body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 24px; color: #0f172a; }
          h1 { font-size: 20px; margin: 0 0 8px; }
          h2 { font-size: 14px; margin: 22px 0 10px; }
          .muted { color: var(--muted); font-size: 12px; }
          .card { border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin: 12px 0; }
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px; font-size: 12px; }
          .kv div { padding: 3px 0; }
          .k { color: var(--muted); }
          .row { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; break-inside: avoid; }
          .row-head { display: flex; justify-content: space-between; gap: 10px; }
          .sec { font-size: 12px; color: var(--muted); }
          .pts { font-size: 12px; color: var(--muted); }
          .item { font-size: 13px; margin-top: 4px; }
          .meta { font-size: 12px; margin-top: 6px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
          .thumb { width: 100%; height: 110px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); }
          .activity { border-top: 1px dashed var(--border); padding-top: 10px; margin-top: 10px; break-inside: avoid; }
          .activity-top { display: flex; justify-content: space-between; gap: 10px; }
          .details { font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
          @media print { body { margin: 0.4in; } .card { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        <h1>CAPA Report: ${escapeHtml(capa.capa_code || '')}</h1>
        <div class="card">
          <div class="grid2">
            <div class="kv">
              <div class="k">Entity</div>
              <div>${escapeHtml(entityInfo ? `${entityInfo.code} - ${entityInfo.name} (${entityInfo.type})` : '')}</div>

              <div class="k">Status</div>
              <div>${escapeHtml(capa.status || '')}</div>

              <div class="k">Priority</div>
              <div>${escapeHtml(capa.priority || '')}</div>

              <div class="k">Due Date</div>
              <div>${escapeHtml(capa.due_date || '')}</div>

              <div class="k">Assigned To</div>
              <div>${escapeHtml(userNameById(capa.assigned_to))}</div>
            </div>
            <div class="kv">
              <div class="k">Audit Code</div>
              <div>${escapeHtml(audit?.audit_code || '')}</div>

              <div class="k">Audit Status</div>
              <div>${escapeHtml(audit?.status || '')}</div>

              <div class="k">Auditor</div>
              <div>${escapeHtml(userNameById(audit?.auditor_id))}</div>

              <div class="k">Score</div>
              <div>${escapeHtml(audit?.score != null ? String(audit.score) : '')}</div>

              <div class="k">Pass/Fail</div>
              <div>${escapeHtml(audit?.pass_fail || '')}</div>
            </div>
          </div>
        </div>

        <h2>CAPA Details</h2>
        <div class="card">
          <div class="muted">Description</div>
          <div class="details">${escapeHtml(capa.description || '')}</div>
          <div style="height:10px"></div>
          <div class="muted">Corrective Action Taken</div>
          <div class="details">${escapeHtml(capa.notes || '')}</div>
        </div>

        ${finding ? `
          <h2>Finding</h2>
          <div class="card">
            <div class="kv">
              <div class="k">Finding Code</div>
              <div>${escapeHtml(finding.finding_code || '')}</div>
              <div class="k">Severity</div>
              <div>${escapeHtml(finding.severity || '')}</div>
              <div class="k">Section</div>
              <div>${escapeHtml(finding.section_name || '')}</div>
              <div class="k">Category</div>
              <div>${escapeHtml(finding.category || '')}</div>
            </div>
            <div style="height:10px"></div>
            <div class="details">${escapeHtml(finding.description || '')}</div>
            ${findingEvidenceHtml ? `<div class="grid" style="margin-top:12px">${findingEvidenceHtml}</div>` : ''}
          </div>
        ` : ''}

        ${capaEvidenceHtml ? `
          <h2>CAPA Evidence</h2>
          <div class="card">
            <div class="grid">${capaEvidenceHtml}</div>
          </div>
        ` : ''}

        <h2>Audit Checklist</h2>
        <div class="card">${checklistHtml || '<div class="muted">No audit results available.</div>'}</div>

        <h2>Activity</h2>
        <div class="card">${activityHtml || '<div class="muted">No activity log.</div>'}</div>

        <script>
          (function() {
            const imgs = Array.from(document.images || []);
            if (!imgs.length) return;
            let remaining = imgs.length;
            const done = () => { remaining--; if (remaining <= 0) { setTimeout(() => { window.focus(); }, 50); } };
            imgs.forEach(img => {
              if (img.complete) return done();
              img.addEventListener('load', done);
              img.addEventListener('error', done);
            });
          })();
        </script>
      </body>
    </html>
  `;

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) throw new Error('Popup blocked');
  w.document.open();
  w.document.write(html);
  w.document.close();
}
