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

const setCell = (ws: XLSX.WorkSheet, r: number, c: number, v: any, s?: any) => {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell: any = { v, t: typeof v === 'number' ? 'n' : 's' };
  if (s) cell.s = s;
  ws[addr] = cell;
};

const applyWsStyles = (ws: XLSX.WorkSheet, styles: Array<{ r: number; c: number; s: any }>) => {
  for (const it of styles) {
    const addr = XLSX.utils.encode_cell({ r: it.r, c: it.c });
    const cell: any = ws[addr];
    if (!cell) continue;
    cell.s = { ...(cell.s || {}), ...(it.s || {}) };
  }
};

const sTitle = {
  font: { bold: true, sz: 16, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'left', vertical: 'center' },
} as const;

const sMeta = {
  font: { sz: 11, color: { rgb: '475569' } },
  alignment: { horizontal: 'left', vertical: 'center' },
} as const;

const sSection = {
  font: { bold: true, sz: 12, color: { rgb: '0F172A' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
  border: {
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  },
  alignment: { horizontal: 'left', vertical: 'center' },
} as const;

const sKey = {
  font: { bold: true, sz: 11, color: { rgb: '334155' } },
  alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
} as const;

const sVal = {
  font: { sz: 11, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
} as const;

const sHeader = {
  font: { bold: true, sz: 11, color: { rgb: '0F172A' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
  border: {
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
} as const;

const sCell = {
  font: { sz: 11, color: { rgb: '0F172A' } },
  border: {
    bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
    left: { style: 'thin', color: { rgb: 'E2E8F0' } },
    right: { style: 'thin', color: { rgb: 'E2E8F0' } },
  },
  alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
} as const;

const isLikelyStoragePath = (s: string): boolean => {
  if (!s) return false;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return false;
  return true;
};

const isSafeHttpUrl = (s: string): boolean => {
  if (!s) return false;
  if (s.startsWith('http://') || s.startsWith('https://')) return true;
  if (s.startsWith('data:image/')) return true;
  return false;
};

const isImageUrl = (url: string): boolean => {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const base = url.split('?')[0].toLowerCase();
  return base.endsWith('.jpg') || base.endsWith('.jpeg') || base.endsWith('.png') || base.endsWith('.gif') || base.endsWith('.webp');
};

const trySignEvidencePaths = async (paths: string[]): Promise<string[]> => {
  if (paths.length === 0) return [];
  try {
    return await createSignedCAPAEvidenceUrls(paths);
  } catch {
    try {
      return await createSignedAuditEvidenceUrls(paths);
    } catch {
      console.warn('Failed to sign evidence paths; falling back to original paths');
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

  const title = `CAPA Report${capa?.capa_code ? ` - ${capa.capa_code}` : ''}`;
  const generatedAt = new Date().toLocaleString();

  const capaInfoAoA: any[][] = [
    [title],
    [`Generated: ${generatedAt}`],
    [],
    ['CAPA Information', ''],
    ['CAPA Code', capa.capa_code || ''],
    ['Status', capa.status || ''],
    ['Priority', capa.priority || ''],
    ['Entity', entityInfo ? `${entityInfo.code} - ${entityInfo.name} (${entityInfo.type})` : ''],
    ['Due Date', capa.due_date || ''],
    ['Assigned To', userNameById(capa.assigned_to)],
    ['Created At', formatDate(capa.created_at)],
    ['Updated At', formatDate(capa.updated_at)],
    [],
    ['CAPA Requirement', ''],
    [capa.description || '—'],
    [],
    ['Corrective Action Taken', ''],
    [capa.notes || '—'],
  ];

  const capaWs = XLSX.utils.aoa_to_sheet(capaInfoAoA);
  capaWs['!cols'] = [{ wch: 26 }, { wch: 92 }];
  capaWs['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },
    { s: { r: 14, c: 0 }, e: { r: 14, c: 1 } },
    { s: { r: 16, c: 0 }, e: { r: 16, c: 1 } },
    { s: { r: 17, c: 0 }, e: { r: 17, c: 1 } },
  ];

  applyWsStyles(capaWs, [
    { r: 0, c: 0, s: sTitle },
    { r: 1, c: 0, s: sMeta },
    { r: 3, c: 0, s: sSection },
    { r: 13, c: 0, s: sSection },
    { r: 16, c: 0, s: sSection },
    ...Array.from({ length: 8 }).flatMap((_, i) => [
      { r: 4 + i, c: 0, s: sKey },
      { r: 4 + i, c: 1, s: sVal },
    ]),
    { r: 14, c: 0, s: sVal },
    { r: 17, c: 0, s: sVal },
  ]);
  XLSX.utils.book_append_sheet(wb, capaWs, 'CAPA');

  const auditAoA: any[][] = [
    ['Audit Summary', ''],
    ['Audit Code', audit?.audit_code || ''],
    ['Status', audit?.status || ''],
    ['Scheduled Date', audit?.scheduled_date || ''],
    ['Started At', audit?.started_at || ''],
    ['Completed At', audit?.completed_at || ''],
    ['Score', audit?.score ?? ''],
    ['Pass/Fail', audit?.pass_fail ?? ''],
    ['Auditor', userNameById(audit?.auditor_id)],
    ['Template', audit?.template_id || ''],
  ];
  const auditWs = XLSX.utils.aoa_to_sheet(auditAoA);
  auditWs['!cols'] = [{ wch: 26 }, { wch: 92 }];
  auditWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  applyWsStyles(auditWs, [
    { r: 0, c: 0, s: sSection },
    ...Array.from({ length: 9 }).flatMap((_, i) => [
      { r: 1 + i, c: 0, s: sKey },
      { r: 1 + i, c: 1, s: sVal },
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, auditWs, 'Audit');

  const findingAoA: any[][] = [
    ['Finding Summary', ''],
    ['Finding Code', finding?.finding_code || ''],
    ['Severity', finding?.severity || ''],
    ['Status', finding?.status || ''],
    ['Section', finding?.section_name || ''],
    ['Category', finding?.category || ''],
    [],
    ['Description', ''],
    [finding?.description || '—'],
  ];
  const findingWs = XLSX.utils.aoa_to_sheet(findingAoA);
  findingWs['!cols'] = [{ wch: 26 }, { wch: 92 }];
  findingWs['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 7, c: 0 }, e: { r: 7, c: 1 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } },
  ];
  applyWsStyles(findingWs, [
    { r: 0, c: 0, s: sSection },
    ...Array.from({ length: 5 }).flatMap((_, i) => [
      { r: 1 + i, c: 0, s: sKey },
      { r: 1 + i, c: 1, s: sVal },
    ]),
    { r: 7, c: 0, s: sSection },
    { r: 8, c: 0, s: sVal },
  ]);
  XLSX.utils.book_append_sheet(wb, findingWs, 'Finding');

  const checklistHeader = ['Section', 'Item', 'Response', 'Points Earned', 'Max Points', 'Evidence Count'];
  const checklistAoA: any[][] = [checklistHeader];
  for (const r of auditResults || []) {
    const meta = findTemplateItem(templateSections, (r as any).section_id, (r as any).item_id);
    checklistAoA.push([
      meta.sectionName,
      meta.itemText,
      formatResponse((r as any).response),
      (r as any).points_earned ?? '',
      meta.maxPoints ?? '',
      Array.isArray((r as any).evidence_urls) ? (r as any).evidence_urls.length : 0,
    ]);
  }
  const checklistWs = XLSX.utils.aoa_to_sheet(checklistAoA);
  checklistWs['!cols'] = [{ wch: 22 }, { wch: 70 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  checklistWs['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
  applyWsStyles(checklistWs, [
    ...checklistHeader.map((_, c) => ({ r: 0, c, s: sHeader })),
  ]);
  XLSX.utils.book_append_sheet(wb, checklistWs, 'Checklist');

  const evidenceHeader = ['Type', 'Reference', '#', 'URL'];
  const evidenceAoA: any[][] = [evidenceHeader];

  let idx = 1;
  for (const url of bundle.signedCapaEvidenceUrls || []) {
    evidenceAoA.push(['CAPA', capa.capa_code || '', idx, url]);
    idx += 1;
  }

  idx = 1;
  for (const url of bundle.signedFindingEvidenceUrls || []) {
    evidenceAoA.push(['Finding', finding?.finding_code || '', idx, url]);
    idx += 1;
  }

  const auditEntries = Object.entries(bundle.signedAuditEvidenceByItemId || {});
  for (const [itemId, urls] of auditEntries) {
    let i = 1;
    for (const url of urls) {
      evidenceAoA.push(['Audit Item', itemId, i, url]);
      i += 1;
    }
  }
  const evidenceWs = XLSX.utils.aoa_to_sheet(evidenceAoA);
  evidenceWs['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 6 }, { wch: 100 }];
  evidenceWs['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
  applyWsStyles(evidenceWs, [
    ...evidenceHeader.map((_, c) => ({ r: 0, c, s: sHeader })),
  ]);

  for (let r = 1; r < evidenceAoA.length; r += 1) {
    const url = String(evidenceAoA[r][3] || '');
    setCell(evidenceWs, r, 3, url, {
      ...sCell,
      font: { ...sCell.font, color: { rgb: '2563EB' }, underline: true },
    });

    const addr = XLSX.utils.encode_cell({ r, c: 3 });
    const cell: any = evidenceWs[addr];
    if (cell && url) {
      cell.l = { Target: url, Tooltip: url };
    }
  }
  XLSX.utils.book_append_sheet(wb, evidenceWs, 'Evidence');

  const activityHeader = ['Date', 'Action', 'User', 'Details'];
  const activityAoA: any[][] = [activityHeader];
  (activities || [])
    .slice()
    .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .forEach((a: any) => {
      activityAoA.push([
        a.created_at ? formatDate(a.created_at) : '',
        a.action || '',
        userNameById(a.user_id),
        a.details || '',
      ]);
    });
  const activityWs = XLSX.utils.aoa_to_sheet(activityAoA);
  activityWs['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 80 }];
  activityWs['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
  applyWsStyles(activityWs, [
    ...activityHeader.map((_, c) => ({ r: 0, c, s: sHeader })),
  ]);
  XLSX.utils.book_append_sheet(wb, activityWs, 'Activity');

  const filename = `${capa.capa_code || 'CAPA'}_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function openCAPAReportPrintView(bundle: ExportBundle): void {
  const { capa, audit, finding, entityInfo, auditResults, activities, userNameById } = bundle;
  const templateSections = extractTemplateSections(bundle.template);

  const checklistTableRows = (auditResults || [])
    .map((r: any) => {
      const meta = findTemplateItem(templateSections, r.section_id, r.item_id);
      const pts = `${String(r.points_earned ?? '')}${meta.maxPoints != null ? ` / ${String(meta.maxPoints)}` : ''}`;
      return `
        <tr>
          <td class="td sec">${escapeHtml(meta.sectionName)}</td>
          <td class="td item">${escapeHtml(meta.itemText)}</td>
          <td class="td resp">${escapeHtml(formatResponse(r.response))}</td>
          <td class="td pts">${escapeHtml(pts)}</td>
          <td class="td ev">${escapeHtml(String(Array.isArray(r.evidence_urls) ? r.evidence_urls.length : 0))}</td>
        </tr>
      `;
    })
    .join('');

  const capaEvidenceHtml = (bundle.signedCapaEvidenceUrls || [])
    .filter((u) => isSafeHttpUrl(u) && isImageUrl(u))
    .slice(0, 12)
    .map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="capa-evidence" />`)
    .join('');

  const findingEvidenceHtml = (bundle.signedFindingEvidenceUrls || [])
    .filter((u) => isSafeHttpUrl(u) && isImageUrl(u))
    .slice(0, 12)
    .map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="finding-evidence" />`)
    .join('');

  const auditEvidenceBlocksHtml = (auditResults || [])
    .map((r: any) => {
      const urls = (bundle.signedAuditEvidenceByItemId?.[r.item_id] || [])
        .filter((u) => isSafeHttpUrl(u) && isImageUrl(u))
        .slice(0, 10);
      if (!urls.length) return '';
      const meta = findTemplateItem(templateSections, r.section_id, r.item_id);
      const imgs = urls.map((u) => `<img class="thumb" src="${escapeHtml(u)}" alt="audit-evidence" />`).join('');
      return `
        <div class="ev-block">
          <div class="ev-title">
            <span class="ev-sec">${escapeHtml(meta.sectionName)}</span>
            <span class="ev-item">${escapeHtml(meta.itemText)}</span>
          </div>
          <div class="grid">${imgs}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  const hasAuditorEvidence = Boolean(findingEvidenceHtml) || Boolean(auditEvidenceBlocksHtml);

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
          :root {
            --bg: #ffffff;
            --text: #0f172a;
            --muted: #64748b;
            --border: #e2e8f0;
            --soft: #f8fafc;
            --accent: #0ea5e9;
            --shadow: 0 10px 30px rgba(2, 6, 23, 0.06);
          }
          * { box-sizing: border-box; }
          body {
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
            margin: 0;
            background: linear-gradient(180deg, #f1f5f9 0%, #ffffff 45%, #ffffff 100%);
            color: var(--text);
          }
          .page {
            padding: 26px 28px;
            max-width: 980px;
            margin: 0 auto;
          }
          .topbar {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            padding: 14px 16px;
            border: 1px solid var(--border);
            border-radius: 14px;
            background: linear-gradient(180deg, #ffffff, var(--soft));
            box-shadow: var(--shadow);
            position: relative;
            overflow: hidden;
          }
          .topbar:before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--accent), #22c55e);
          }
          .brand {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .brand .title { font-size: 20px; font-weight: 800; letter-spacing: 0.2px; }
          .brand .subtitle { font-size: 12px; color: var(--muted); }
          .codepill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border: 1px solid var(--border);
            background: #fff;
            border-radius: 999px;
            font-size: 12px;
            color: var(--muted);
          }
          .codepill b { color: var(--text); font-weight: 800; }
          h2 { font-size: 12px; margin: 18px 0 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
          .muted { color: var(--muted); font-size: 12px; }
          .card {
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 14px;
            margin: 10px 0;
            background: #fff;
            box-shadow: var(--shadow);
          }
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px; font-size: 12px; }
          .kv div { padding: 3px 0; }
          .k {
            color: var(--muted);
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .details { font-size: 13px; margin-top: 6px; white-space: pre-wrap; line-height: 1.55; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
          .thumb { width: 100%; height: 132px; object-fit: cover; border-radius: 12px; border: 1px solid var(--border); background: var(--soft); }
          .ev-block { margin-top: 12px; break-inside: avoid; }
          .ev-title { display: grid; grid-template-columns: 160px 1fr; gap: 10px; align-items: baseline; }
          .ev-sec { color: var(--muted); font-weight: 800; letter-spacing: 0.02em; font-size: 12px; }
          .ev-item { color: var(--text); font-weight: 700; font-size: 12px; }
          .table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; }
          .th {
            text-align: left;
            font-size: 11px;
            color: var(--muted);
            background: var(--soft);
            padding: 10px 10px;
            border-bottom: 1px solid var(--border);
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .td {
            font-size: 12px;
            padding: 10px 10px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
          }
          tr:last-child .td { border-bottom: 0; }
          .td.sec { width: 18%; color: var(--muted); }
          .td.item { width: 44%; }
          .td.resp { width: 16%; }
          .td.pts { width: 12%; text-align: right; white-space: nowrap; }
          .td.ev { width: 10%; text-align: right; white-space: nowrap; }
          .activity { border-top: 1px dashed var(--border); padding-top: 10px; margin-top: 10px; break-inside: avoid; }
          .activity-top { display: flex; justify-content: space-between; gap: 10px; }
          .badge {
            display: inline-flex;
            align-items: center;
            padding: 3px 10px;
            border-radius: 999px;
            border: 1px solid var(--border);
            font-size: 12px;
            color: var(--muted);
            background: #fff;
            font-weight: 700;
          }
          @media print {
            @page { margin: 0.45in; }
            body { background: #fff; }
            .page { padding: 0; max-width: none; margin: 0; }
            .card { break-inside: avoid; }
            .topbar { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="topbar">
            <div class="brand">
              <div class="title">CAPA Report</div>
              <div class="subtitle">Generated ${escapeHtml(new Date().toLocaleString())}</div>
            </div>
            <div class="codepill">CAPA: <b>${escapeHtml(capa.capa_code || '')}</b></div>
          </div>

          <div class="card">
            <div class="grid2">
              <div class="kv">
                <div class="k">Entity</div>
                <div>${escapeHtml(entityInfo ? `${entityInfo.code} - ${entityInfo.name} (${entityInfo.type})` : '')}</div>

                <div class="k">Status</div>
                <div><span class="badge">${escapeHtml(capa.status || '')}</span></div>

                <div class="k">Priority</div>
                <div><span class="badge">${escapeHtml(capa.priority || '')}</span></div>

                <div class="k">Due Date</div>
                <div>${escapeHtml(capa.due_date || '')}</div>

                <div class="k">Assigned To</div>
                <div>${escapeHtml(userNameById(capa.assigned_to))}</div>
              </div>
              <div class="kv">
                <div class="k">Audit Code</div>
                <div>${escapeHtml(audit?.audit_code || '')}</div>

                <div class="k">Audit Status</div>
                <div><span class="badge">${escapeHtml(audit?.status || '')}</span></div>

                <div class="k">Auditor</div>
                <div>${escapeHtml(userNameById(audit?.auditor_id))}</div>

                <div class="k">Score</div>
                <div>${escapeHtml(audit?.score != null ? String(audit.score) : '')}</div>

                <div class="k">Pass/Fail</div>
                <div><span class="badge">${escapeHtml(audit?.pass_fail || '')}</span></div>
              </div>
            </div>
          </div>

          <h2>CAPA Details</h2>
          <div class="card">
            <div class="muted">Requirement</div>
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
                <div><span class="badge">${escapeHtml(finding.severity || '')}</span></div>
                <div class="k">Section</div>
                <div>${escapeHtml(finding.section_name || '')}</div>
                <div class="k">Category</div>
                <div>${escapeHtml(finding.category || '')}</div>
              </div>
              <div style="height:10px"></div>
              <div class="details">${escapeHtml(finding.description || '')}</div>
            </div>
          ` : ''}

          ${hasAuditorEvidence ? `
            <h2>Auditor Evidence</h2>
            <div class="card">
              <div class="muted">Evidence captured during audit (before corrective action).</div>
              ${findingEvidenceHtml ? `
                <div style="height:10px"></div>
                <div class="ev-block">
                  <div class="ev-title">
                    <span class="ev-sec">Finding</span>
                    <span class="ev-item">${escapeHtml(finding?.description || '')}</span>
                  </div>
                  <div class="grid">${findingEvidenceHtml}</div>
                </div>
              ` : ''}
              ${auditEvidenceBlocksHtml ? `
                <div style="height:10px"></div>
                ${auditEvidenceBlocksHtml}
              ` : ''}
              ${!findingEvidenceHtml && !auditEvidenceBlocksHtml ? '<div class="muted">No auditor evidence available.</div>' : ''}
            </div>
          ` : ''}

          ${capaEvidenceHtml ? `
            <h2>Corrective Action Evidence (Manager)</h2>
            <div class="card">
              <div class="muted">Evidence uploaded after corrective action was completed.</div>
              <div style="height:10px"></div>
              <div class="grid">${capaEvidenceHtml}</div>
            </div>
          ` : ''}

          <h2>Audit Checklist</h2>
          <div class="card">
            ${checklistTableRows
              ? `
                <table class="table">
                  <thead>
                    <tr>
                      <th class="th">Section</th>
                      <th class="th">Item</th>
                      <th class="th">Response</th>
                      <th class="th" style="text-align:right">Points</th>
                      <th class="th" style="text-align:right">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${checklistTableRows}
                  </tbody>
                </table>
              `
              : '<div class="muted">No audit results available.</div>'}
          </div>

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
        </div>
      </body>
    </html>
  `;

  const w = window.open('', '_blank');
  if (!w) throw new Error('Popup blocked');
  try {
    // Ensure security without breaking document access for writing content
    (w as any).opener = null;
  } catch {
    // ignore
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
