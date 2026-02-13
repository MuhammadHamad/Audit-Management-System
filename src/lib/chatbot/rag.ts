import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { User, UserRole } from "@/types";

type TableName = keyof Database["public"]["Tables"];

type ProviderResult = {
  title: string;
  lines: string[];
};

type RagProvider = {
  id: string;
  title: string;
  enabled: (user: User | null) => boolean;
  retrieve: (params: {
    query: string;
    user: User | null;
    maxItems: number;
  }) => Promise<ProviderResult | null>;
};

function normalizeQuery(query: string): string {
  return query.trim().slice(0, 120);
}

function keywordHit(query: string, keywords: string[]): boolean {
  const q = query.toLowerCase();
  return keywords.some((k) => q.includes(k));
}

function safeText(value: unknown, max = 180): string {
  if (value == null) return "";
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function canSeeUserDirectory(role?: UserRole): boolean {
  return role === "super_admin" || role === "audit_manager";
}

async function ilikeOrLatest<T extends Record<string, any>>(params: {
  table: TableName;
  select: string;
  orderBy: string;
  query: string;
  orIlike?: string;
  limit: number;
}): Promise<T[]> {
  const q = normalizeQuery(params.query);

  let req = supabase
    .from(params.table)
    .select(params.select)
    .order(params.orderBy, { ascending: false })
    .limit(params.limit);

  if (q && params.orIlike) {
    req = req.or(params.orIlike);
  }

  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

async function countRows(table: TableName, filter?: { column: string; op: string; value: string }): Promise<number> {
  let req: any = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) {
    if (filter.op === 'eq') req = req.eq(filter.column, filter.value);
    else if (filter.op === 'gte') req = req.gte(filter.column, filter.value);
    else if (filter.op === 'lte') req = req.lte(filter.column, filter.value);
  }
  const { count, error } = await req;
  if (error) return 0;
  return typeof count === 'number' ? count : 0;
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

const providers: RagProvider[] = [
  {
    id: "summary",
    title: "System Summary (Live Counts)",
    enabled: () => true,
    retrieve: async () => {
      const month = getMonthRange();

      const [branches, bcks, suppliers, regions, users, templates, plans,
        auditsTotal, auditsThisMonth, auditsScheduled, auditsInProgress, auditsPendingVerification, auditsApproved,
        capasTotal, capasOpen, capasClosed,
        findingsTotal, findingsOpen,
        incidentsTotal, incidentsOpen
      ] = await Promise.all([
        countRows('branches'),
        countRows('bcks'),
        countRows('suppliers'),
        countRows('regions'),
        countRows('users'),
        countRows('audit_templates'),
        countRows('audit_plans'),
        countRows('audits'),
        countRows('audits', { column: 'scheduled_date', op: 'gte', value: month.start }),
        countRows('audits', { column: 'status', op: 'eq', value: 'scheduled' }),
        countRows('audits', { column: 'status', op: 'eq', value: 'in_progress' }),
        countRows('audits', { column: 'status', op: 'eq', value: 'pending_verification' }),
        countRows('audits', { column: 'status', op: 'eq', value: 'approved' }),
        countRows('capa'),
        countRows('capa', { column: 'status', op: 'eq', value: 'open' }),
        countRows('capa', { column: 'status', op: 'eq', value: 'closed' }),
        countRows('findings'),
        countRows('findings', { column: 'status', op: 'eq', value: 'open' }),
        countRows('incidents'),
        countRows('incidents', { column: 'status', op: 'eq', value: 'open' }),
      ]);

      const totalEntities = branches + bcks + suppliers;

      return {
        title: "System Summary (Live Counts)",
        lines: [
          `Total entities: ${totalEntities} (${branches} branches, ${bcks} BCKs, ${suppliers} suppliers)`,
          `Regions: ${regions}`,
          `Users: ${users}`,
          `Audit templates: ${templates}`,
          `Audit plans: ${plans}`,
          `Audits total: ${auditsTotal} | This month: ${auditsThisMonth} | Scheduled: ${auditsScheduled} | In progress: ${auditsInProgress} | Pending verification: ${auditsPendingVerification} | Approved: ${auditsApproved}`,
          `CAPA total: ${capasTotal} | Open: ${capasOpen} | Closed: ${capasClosed}`,
          `Findings total: ${findingsTotal} | Open: ${findingsOpen}`,
          `Incidents total: ${incidentsTotal} | Open: ${incidentsOpen}`,
          `Current month: ${month.start} to ${month.end}`,
        ],
      };
    },
  },
  {
    id: "audit_templates",
    title: "Templates",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q
        ? `name.ilike.%${q}%,code.ilike.%${q}%,entity_type.ilike.%${q}%,status.ilike.%${q}%`
        : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        code: string;
        name: string;
        entity_type: string;
        status: string | null;
        version: number | null;
        updated_at: string | null;
      }>({
        table: "audit_templates",
        select: "id,code,name,entity_type,status,version,updated_at",
        orderBy: "updated_at",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "Templates",
        lines: rows.map((r) => {
          const status = safeText(r.status ?? "");
          const v = r.version != null ? `v${r.version}` : "";
          return `${safeText(r.code)} — ${safeText(r.name)} (${safeText(r.entity_type)}) ${v} ${status ? `• ${status}` : ""}`.trim();
        }),
      };
    },
  },
  {
    id: "audit_plans",
    title: "Audit Plans",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q
        ? `name.ilike.%${q}%,description.ilike.%${q}%,entity_type.ilike.%${q}%,status.ilike.%${q}%`
        : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        name: string;
        entity_type: string;
        status: string | null;
        created_at: string | null;
      }>({
        table: "audit_plans",
        select: "id,name,entity_type,status,created_at",
        orderBy: "created_at",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "Audit Plans",
        lines: rows.map((r) => {
          const status = safeText(r.status ?? "");
          return `${safeText(r.name)} (${safeText(r.entity_type)})${status ? ` • ${status}` : ""} • ${formatDate(r.created_at)}`.trim();
        }),
      };
    },
  },
  {
    id: "audits",
    title: "Audits (Full Detail)",
    enabled: (user) => !!user,
    retrieve: async ({ maxItems }) => {
      const { data: audits, error } = await supabase
        .from('audits')
        .select('id,audit_code,status,entity_type,entity_id,auditor_id,template_id,scheduled_date,started_at,completed_at,score,pass_fail,created_at')
        .order('scheduled_date', { ascending: false })
        .limit(maxItems);

      if (error || !audits || audits.length === 0) return null;

      // Resolve entity names and auditor names in parallel
      const entityIds = [...new Set(audits.map((a: any) => a.entity_id).filter(Boolean))];
      const auditorIds = [...new Set(audits.map((a: any) => a.auditor_id).filter(Boolean))];

      const [branchesRes, bcksRes, suppliersRes, usersRes] = await Promise.all([
        entityIds.length ? supabase.from('branches').select('id,code,name,city').in('id', entityIds) : { data: [] },
        entityIds.length ? supabase.from('bcks').select('id,code,name,city').in('id', entityIds) : { data: [] },
        entityIds.length ? supabase.from('suppliers').select('id,code,name,city').in('id', entityIds) : { data: [] },
        auditorIds.length ? supabase.from('users').select('id,full_name,role').in('id', auditorIds) : { data: [] },
      ]);

      const entityMap = new Map<string, string>();
      for (const b of (branchesRes.data ?? []) as any[]) entityMap.set(b.id, `Branch ${b.code} — ${b.name}${b.city ? ` (${b.city})` : ''}`);
      for (const b of (bcksRes.data ?? []) as any[]) entityMap.set(b.id, `BCK ${b.code} — ${b.name}${b.city ? ` (${b.city})` : ''}`);
      for (const s of (suppliersRes.data ?? []) as any[]) entityMap.set(s.id, `Supplier ${s.code} — ${s.name}${s.city ? ` (${s.city})` : ''}`);

      const userMap = new Map<string, string>();
      for (const u of (usersRes.data ?? []) as any[]) userMap.set(u.id, `${u.full_name} (${u.role})`);

      return {
        title: "Audits (Full Detail)",
        lines: (audits as any[]).map((r) => {
          const entity = entityMap.get(r.entity_id) ?? `${r.entity_type}:${safeText(r.entity_id, 24)}`;
          const auditor = r.auditor_id ? (userMap.get(r.auditor_id) ?? 'Unknown') : 'Unassigned';
          const score = r.score != null ? `Score: ${r.score}` : '';
          const pf = r.pass_fail ? `Result: ${safeText(r.pass_fail)}` : '';
          const started = r.started_at ? `Started: ${formatDate(r.started_at)}` : '';
          const completed = r.completed_at ? `Completed: ${formatDate(r.completed_at)}` : '';
          const parts = [
            `Code: ${safeText(r.audit_code)}`,
            `Status: ${safeText(r.status)}`,
            `Entity: ${entity}`,
            `Auditor: ${auditor}`,
            `Scheduled: ${formatDate(r.scheduled_date)}`,
            started, completed, score, pf,
          ].filter(Boolean);
          return parts.join(' | ');
        }),
      };
    },
  },
  {
    id: "findings",
    title: "Findings",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q
        ? `finding_code.ilike.%${q}%,severity.ilike.%${q}%,status.ilike.%${q}%,description.ilike.%${q}%`
        : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        finding_code: string;
        audit_id: string;
        severity: string;
        status: string;
        description: string;
        created_at: string | null;
      }>({
        table: "findings",
        select: "id,finding_code,audit_id,severity,status,description,created_at",
        orderBy: "created_at",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "Findings",
        lines: rows.map((r) => {
          const desc = safeText(r.description, 120);
          return `${safeText(r.finding_code)} • ${safeText(r.severity)} • ${safeText(r.status)} • audit:${safeText(r.audit_id, 24)} • ${desc}`.trim();
        }),
      };
    },
  },
  {
    id: "capa",
    title: "CAPA",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q
        ? `capa_code.ilike.%${q}%,status.ilike.%${q}%,priority.ilike.%${q}%,description.ilike.%${q}%`
        : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        capa_code: string;
        status: string;
        priority: string;
        due_date: string | null;
        entity_type: string;
        entity_id: string;
        description: string;
      }>({
        table: "capa",
        select: "id,capa_code,status,priority,due_date,entity_type,entity_id,description",
        orderBy: "due_date",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "CAPA",
        lines: rows.map((r) => {
          const due = r.due_date ? `due ${formatDate(r.due_date)}` : "";
          const desc = safeText(r.description, 120);
          return `${safeText(r.capa_code)} • ${safeText(r.status)} • ${safeText(r.priority)} ${due ? `• ${due}` : ""} • ${safeText(r.entity_type)}:${safeText(r.entity_id, 30)} • ${desc}`.trim();
        }),
      };
    },
  },
  {
    id: "incidents",
    title: "Incidents",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q
        ? `incident_code.ilike.%${q}%,title.ilike.%${q}%,status.ilike.%${q}%,severity.ilike.%${q}%,category.ilike.%${q}%`
        : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        incident_code: string;
        title: string;
        severity: string;
        status: string;
        entity_type: string;
        entity_id: string;
        created_at: string | null;
      }>({
        table: "incidents",
        select: "id,incident_code,title,severity,status,entity_type,entity_id,created_at",
        orderBy: "created_at",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "Incidents",
        lines: rows.map((r) => {
          return `${safeText(r.incident_code)} • ${safeText(r.severity)} • ${safeText(r.status)} • ${safeText(r.title, 120)} • ${safeText(r.entity_type)}:${safeText(r.entity_id, 30)}`.trim();
        }),
      };
    },
  },
  {
    id: "entities",
    title: "Entities",
    enabled: (user) => !!user,
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const hasEntityIntent = keywordHit(q, ["branch", "bck", "supplier", "region"]) || q.length >= 2;

      if (!hasEntityIntent) {
        return null;
      }

      const [branches, bcks, suppliers, regions] = await Promise.all([
        ilikeOrLatest<{ id: string; code: string; name: string; city: string | null; status: string | null }>({
          table: "branches",
          select: "id,code,name,city,status",
          orderBy: "name",
          query,
          orIlike: q ? `name.ilike.%${q}%,code.ilike.%${q}%,city.ilike.%${q}%` : undefined,
          limit: Math.max(3, Math.floor(maxItems / 4)),
        }),
        ilikeOrLatest<{ id: string; code: string; name: string; city: string | null; status: string | null }>({
          table: "bcks",
          select: "id,code,name,city,status",
          orderBy: "name",
          query,
          orIlike: q ? `name.ilike.%${q}%,code.ilike.%${q}%,city.ilike.%${q}%` : undefined,
          limit: Math.max(3, Math.floor(maxItems / 4)),
        }),
        ilikeOrLatest<{ id: string; code: string; name: string; city: string | null; status: string | null }>({
          table: "suppliers",
          select: "id,code,name,city,status",
          orderBy: "name",
          query,
          orIlike: q ? `name.ilike.%${q}%,code.ilike.%${q}%,city.ilike.%${q}%` : undefined,
          limit: Math.max(3, Math.floor(maxItems / 4)),
        }),
        ilikeOrLatest<{ id: string; code: string; name: string; status: string | null }>({
          table: "regions",
          select: "id,code,name,status",
          orderBy: "name",
          query,
          orIlike: q ? `name.ilike.%${q}%,code.ilike.%${q}%` : undefined,
          limit: Math.max(3, Math.floor(maxItems / 4)),
        }),
      ]);

      const lines: string[] = [];

      for (const b of branches) {
        lines.push(`Branch ${safeText(b.code)} — ${safeText(b.name)}${b.city ? ` (${safeText(b.city)})` : ""}`);
      }
      for (const b of bcks) {
        lines.push(`BCK ${safeText(b.code)} — ${safeText(b.name)}${b.city ? ` (${safeText(b.city)})` : ""}`);
      }
      for (const s of suppliers) {
        lines.push(`Supplier ${safeText(s.code)} — ${safeText(s.name)}${s.city ? ` (${safeText(s.city)})` : ""}`);
      }
      for (const r of regions) {
        lines.push(`Region ${safeText(r.code)} — ${safeText(r.name)}`);
      }

      const trimmed = lines.filter(Boolean).slice(0, maxItems);
      if (trimmed.length === 0) return null;

      return {
        title: "Entities",
        lines: trimmed,
      };
    },
  },
  {
    id: "users",
    title: "Users",
    enabled: (user) => !!user && canSeeUserDirectory(user.role),
    retrieve: async ({ query, maxItems }) => {
      const q = normalizeQuery(query);
      const orIlike = q ? `full_name.ilike.%${q}%,email.ilike.%${q}%,role.ilike.%${q}%` : undefined;

      const rows = await ilikeOrLatest<{
        id: string;
        full_name: string;
        email: string;
        role: string;
        status: string | null;
      }>({
        table: "users",
        select: "id,full_name,email,role,status",
        orderBy: "full_name",
        query,
        orIlike,
        limit: maxItems,
      });

      if (rows.length === 0) return null;

      return {
        title: "Users",
        lines: rows.map((u) => `${safeText(u.full_name)} • ${safeText(u.role)} • ${safeText(u.email, 80)} • ${safeText(u.status ?? "")}`.trim()),
      };
    },
  },
];

export async function buildRagContext(params: {
  query: string;
  user: User | null;
  maxItemsPerProvider?: number;
}): Promise<string> {
  const query = normalizeQuery(params.query);
  const maxItems = params.maxItemsPerProvider ?? 12;

  const wantsTemplates = keywordHit(query, ["template", "checklist"]);
  const wantsPlans = keywordHit(query, ["plan", "recurrence", "schedule"]);
  const wantsAudits = keywordHit(query, ["audit", "verification", "approve", "reject", "score", "pass", "fail"]);
  const wantsCapas = keywordHit(query, ["capa", "corrective", "preventive", "action"]);
  const wantsFindings = keywordHit(query, ["finding", "nc", "nonconform", "non-conform"]);
  const wantsIncidents = keywordHit(query, ["incident", "safety", "food safety"]);
  const wantsEntities = keywordHit(query, ["branch", "bck", "supplier", "region", "entity", "entities", "kitchen", "store"]);
  const wantsUsers = keywordHit(query, ["user", "auditor", "manager", "role", "staff", "team"]);
  const wantsSummary = keywordHit(query, ["how many", "count", "total", "summary", "overview", "dashboard", "stat", "number", "this month", "current"]);

  // Core providers always run — they give the LLM full record details, not just counts.
  // With limit 12 and head:true counts, the total query cost is still very low.
  const alwaysInclude = new Set(["summary", "audits", "capa", "findings"]);

  const selected = providers.filter((p) => {
    if (!p.enabled(params.user)) return false;

    // Always-on providers
    if (alwaysInclude.has(p.id)) return true;

    if (!query) return ["audit_plans", "incidents", "entities"].includes(p.id);

    // If user wants summary/dashboard info, pull everything
    if (wantsSummary) {
      return ["audit_plans", "incidents", "entities", "audit_templates", "users"].includes(p.id);
    }

    if (p.id === "audit_templates") return wantsTemplates;
    if (p.id === "audit_plans") return wantsPlans || wantsAudits;
    if (p.id === "incidents") return wantsIncidents;
    if (p.id === "entities") return wantsEntities;
    if (p.id === "users") return wantsUsers;

    return false;
  });

  const results = await Promise.all(
    selected.map(async (p) => {
      try {
        return await p.retrieve({ query, user: params.user, maxItems });
      } catch {
        return null;
      }
    })
  );

  const sections = results.filter(Boolean) as ProviderResult[];

  const header = [
    "This context was retrieved live from the Audit Management System database.",
    "Use it as ground truth. If data is missing, ask a clarification question.",
    "Do not invent IDs, codes, statuses, or dates.",
  ].join("\n");

  const body = sections
    .map((s) => {
      const lines = s.lines.slice(0, maxItems);
      return [`[${s.title}]`, ...lines.map((l) => `- ${l}`)].join("\n");
    })
    .join("\n\n");

  return body ? `${header}\n\n${body}` : header;
}
