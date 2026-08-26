import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-007 (1º ciclo) — Busca global (MVP lexical).
 *
 * Não existe tabela/índice de busca dedicado: cada grupo é consultado
 * diretamente na sua tabela com `ilike` (via filtro `or`) e RLS como única
 * fonte de verdade de escopo (tenant + permissões). Nenhuma service_role,
 * nenhum DDL neste ciclo.
 *
 * Regras:
 * - termo mínimo de 2 caracteres (após trim) — abaixo disso não consultamos;
 * - linhas com `deleted_at` não nulo são ignoradas;
 * - limite fixo por grupo (`GROUP_LIMIT`), consultas em paralelo;
 * - falha de um grupo não derruba os demais: o grupo entra com `failed`.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const MIN_QUERY_LENGTH = 2;
export const GROUP_LIMIT = 10;

export type SearchGroupKey = "clients" | "vessels" | "actions" | "deliverables" | "evidences";

export const SEARCH_GROUP_ORDER: readonly SearchGroupKey[] = [
  "actions",
  "deliverables",
  "evidences",
  "clients",
  "vessels",
];

export const SEARCH_GROUP_LABELS: Readonly<Record<SearchGroupKey, string>> = {
  actions: "Ações",
  deliverables: "Entregáveis",
  evidences: "Evidências",
  clients: "Clientes",
  vessels: "Embarcações",
};

/** Destino navegável de um resultado; `null` quando não há rota segura. */
export type SearchTarget =
  | { route: "/actions/$actionId"; actionId: string }
  | { route: "/clients/$clientId/edit"; clientId: string }
  | { route: "/vessels/$vesselId/edit"; vesselId: string }
  | null;

export type SearchResultItem = {
  id: string;
  group: SearchGroupKey;
  title: string;
  subtitle: string | null;
  target: SearchTarget;
};

export type SearchGroupResult = {
  key: SearchGroupKey;
  label: string;
  items: SearchResultItem[];
  failed: boolean;
};

export type GlobalSearchResult = {
  term: string;
  groups: SearchGroupResult[];
  total: number;
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

export function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function isQueryTooShort(raw: string): boolean {
  return normalizeTerm(raw).length < MIN_QUERY_LENGTH;
}

/**
 * Escapa caracteres com significado especial no filtro PostgREST:
 * `%`/`_` são curingas do LIKE e `,`/`(`/`)` quebram a sintaxe do `or=`.
 */
export function escapeLikeTerm(raw: string): string {
  return normalizeTerm(raw).replace(/[%_\\]/g, (m) => `\\${m}`).replace(/[,()]/g, " ");
}

/** Monta o filtro `or(...)` do PostgREST para as colunas informadas. */
export function buildOrFilter(columns: readonly string[], raw: string): string {
  const pattern = `%${escapeLikeTerm(raw)}%`;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function totalResults(groups: readonly SearchGroupResult[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

/** Ordena os grupos pela ordem canônica de exibição. */
export function sortGroups(groups: readonly SearchGroupResult[]): SearchGroupResult[] {
  return [...groups].sort(
    (a, b) => SEARCH_GROUP_ORDER.indexOf(a.key) - SEARCH_GROUP_ORDER.indexOf(b.key),
  );
}

export function groupLabel(key: SearchGroupKey): string {
  return SEARCH_GROUP_LABELS[key];
}

function truncate(value: string | null | undefined, max = 140): string | null {
  if (!value) return null;
  const text = value.trim();
  if (text === "") return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function joinSubtitle(parts: (string | null | undefined)[]): string | null {
  const clean = parts.map((p) => (p ? p.trim() : "")).filter((p) => p !== "");
  return clean.length > 0 ? clean.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Mapping puro por grupo
// ---------------------------------------------------------------------------

export type ClientSearchRow = {
  id: string;
  name: string;
  code: string | null;
  contact_name: string | null;
  contact_email: string | null;
};

export function mapClientResult(row: ClientSearchRow): SearchResultItem {
  return {
    id: row.id,
    group: "clients",
    title: row.name,
    subtitle: joinSubtitle([row.code, row.contact_name, row.contact_email]),
    target: { route: "/clients/$clientId/edit", clientId: row.id },
  };
}

export type VesselSearchRow = {
  id: string;
  name: string;
  imo_number: string | null;
  vessel_type: string | null;
  dp_class: string | null;
};

export function mapVesselResult(row: VesselSearchRow): SearchResultItem {
  return {
    id: row.id,
    group: "vessels",
    title: row.name,
    subtitle: joinSubtitle([
      row.imo_number ? `IMO ${row.imo_number}` : null,
      row.vessel_type,
      row.dp_class,
    ]),
    target: { route: "/vessels/$vesselId/edit", vesselId: row.id },
  };
}

export type ActionSearchRow = {
  id: string;
  title: string;
  description: string | null;
  origin: string | null;
  action_type: string | null;
  status: string | null;
};

export function mapActionResult(row: ActionSearchRow): SearchResultItem {
  return {
    id: row.id,
    group: "actions",
    title: row.title,
    subtitle: joinSubtitle([row.status, row.action_type, truncate(row.description)]),
    target: { route: "/actions/$actionId", actionId: row.id },
  };
}

export type DeliverableSearchRow = {
  id: string;
  action_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
};

export function mapDeliverableResult(row: DeliverableSearchRow): SearchResultItem {
  return {
    id: row.id,
    group: "deliverables",
    title: row.title,
    subtitle: joinSubtitle([row.status, truncate(row.description)]),
    target: row.action_id ? { route: "/actions/$actionId", actionId: row.action_id } : null,
  };
}

export type EvidenceSearchRow = {
  id: string;
  deliverable_id: string | null;
  title: string;
  description: string | null;
  file_name: string | null;
};

/**
 * Evidências não têm rota própria: navegamos para a ação pai resolvida pelo
 * mapa deliverable→action. Sem o mapa, o item aparece sem link.
 */
export function mapEvidenceResult(
  row: EvidenceSearchRow,
  deliverableActionMap?: ReadonlyMap<string, string>,
): SearchResultItem {
  const actionId = row.deliverable_id ? deliverableActionMap?.get(row.deliverable_id) : undefined;
  return {
    id: row.id,
    group: "evidences",
    title: row.title,
    subtitle: joinSubtitle([row.file_name, truncate(row.description)]),
    target: actionId ? { route: "/actions/$actionId", actionId } : null,
  };
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

const CLIENT_COLUMNS = ["name", "code", "contact_name", "contact_email"] as const;
const VESSEL_COLUMNS = ["name", "imo_number", "vessel_type", "dp_class"] as const;
const ACTION_COLUMNS = ["title", "description", "origin", "action_type"] as const;
const DELIVERABLE_COLUMNS = ["title", "description"] as const;
const EVIDENCE_COLUMNS = ["title", "description", "file_name"] as const;

function reportFailure(group: SearchGroupKey, error: unknown) {
  emitEvent({
    event_name: "backend.request.failure",
    context: { operation: `global_search.${group}`, supabase_error: sanitize(error) },
  });
}

async function runGroup<T>(
  group: SearchGroupKey,
  run: () => Promise<{ data: unknown; error: unknown }>,
): Promise<{ rows: T[]; failed: boolean }> {
  try {
    const { data, error } = await run();
    if (error) {
      reportFailure(group, error);
      return { rows: [], failed: true };
    }
    return { rows: (data ?? []) as T[], failed: false };
  } catch (error) {
    reportFailure(group, error);
    return { rows: [], failed: true };
  }
}

async function fetchDeliverableActionMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { rows } = await runGroup<{ id: string; action_id: string }>("evidences", () =>
    client().from("deliverables").select("id, action_id").in("id", ids).is("deleted_at", null),
  );
  for (const row of rows) map.set(row.id, row.action_id);
  return map;
}

/**
 * Busca global. Retorna sempre os cinco grupos (mesmo vazios) na ordem
 * canônica; grupos com falha vêm marcados com `failed`.
 */
export async function globalSearch(rawTerm: string): Promise<GlobalSearchResult> {
  const term = normalizeTerm(rawTerm);
  if (term.length < MIN_QUERY_LENGTH) {
    return {
      term,
      groups: SEARCH_GROUP_ORDER.map((key) => ({
        key,
        label: groupLabel(key),
        items: [],
        failed: false,
      })),
      total: 0,
      truncated: false,
    };
  }

  const c = client();

  const [clients, vessels, actions, deliverables, evidences] = await Promise.all([
    runGroup<ClientSearchRow>("clients", () =>
      c
        .from("clients")
        .select("id, name, code, contact_name, contact_email")
        .is("deleted_at", null)
        .or(buildOrFilter(CLIENT_COLUMNS, term))
        .order("name", { ascending: true })
        .limit(GROUP_LIMIT),
    ),
    runGroup<VesselSearchRow>("vessels", () =>
      c
        .from("vessels")
        .select("id, name, imo_number, vessel_type, dp_class")
        .is("deleted_at", null)
        .or(buildOrFilter(VESSEL_COLUMNS, term))
        .order("name", { ascending: true })
        .limit(GROUP_LIMIT),
    ),
    runGroup<ActionSearchRow>("actions", () =>
      c
        .from("actions")
        .select("id, title, description, origin, action_type, status")
        .is("deleted_at", null)
        .or(buildOrFilter(ACTION_COLUMNS, term))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    ),
    runGroup<DeliverableSearchRow>("deliverables", () =>
      c
        .from("deliverables")
        .select("id, action_id, title, description, status")
        .is("deleted_at", null)
        .or(buildOrFilter(DELIVERABLE_COLUMNS, term))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    ),
    runGroup<EvidenceSearchRow>("evidences", () =>
      c
        .from("evidences")
        .select("id, deliverable_id, title, description, file_name")
        .is("deleted_at", null)
        .or(buildOrFilter(EVIDENCE_COLUMNS, term))
        .order("created_at", { ascending: false })
        .limit(GROUP_LIMIT),
    ),
  ]);

  const deliverableIds = evidences.rows
    .map((row) => row.deliverable_id)
    .filter((id): id is string => Boolean(id));
  const actionMap = await fetchDeliverableActionMap(deliverableIds);

  const groups: SearchGroupResult[] = sortGroups([
    {
      key: "clients",
      label: groupLabel("clients"),
      items: clients.rows.map(mapClientResult),
      failed: clients.failed,
    },
    {
      key: "vessels",
      label: groupLabel("vessels"),
      items: vessels.rows.map(mapVesselResult),
      failed: vessels.failed,
    },
    {
      key: "actions",
      label: groupLabel("actions"),
      items: actions.rows.map(mapActionResult),
      failed: actions.failed,
    },
    {
      key: "deliverables",
      label: groupLabel("deliverables"),
      items: deliverables.rows.map(mapDeliverableResult),
      failed: deliverables.failed,
    },
    {
      key: "evidences",
      label: groupLabel("evidences"),
      items: evidences.rows.map((row) => mapEvidenceResult(row, actionMap)),
      failed: evidences.failed,
    },
  ]);

  return {
    term,
    groups,
    total: totalResults(groups),
    truncated: groups.some((group) => group.items.length >= GROUP_LIMIT),
  };
}
