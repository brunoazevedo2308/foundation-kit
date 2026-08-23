import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-006 (1º ciclo) — Central de Notificações: leitura e interação in-app.
 *
 * Usa exclusivamente `public.notifications` (TT-003.5) com as policies
 * atuais:
 * - SELECT: somente o próprio recipient dentro do tenant
 *   (`notifications_select_own_recipient`);
 * - UPDATE: somente o próprio recipient (`notifications_update_recipient_only`),
 *   sem poder trocar `recipient_user_id`/`organization_id` (WITH CHECK);
 * - INSERT: qualquer autenticado same-org (`notifications_insert_same_org`) —
 *   este ciclo NÃO insere notificações; a geração automática (triggers) fica
 *   para um ciclo futuro e deve revisar essa policy.
 *
 * Nenhuma service_role, nenhum DDL. As funções puras de mapping/link são
 * testáveis sem rede.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

/**
 * Evento de janela disparado após mutações de leitura (mark-read) para que o
 * badge do shell se atualize sem polling.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "dp-suite:notifications-changed";

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

// ---------------------------------------------------------------------------
// Tipos e mapping puro
// ---------------------------------------------------------------------------

export type NotificationItem = {
  id: string;
  notificationType: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function isUnread(item: Pick<NotificationItem, "readAt">): boolean {
  return item.readAt === null;
}

export function countUnread(items: Pick<NotificationItem, "readAt">[]): number {
  return items.filter(isUnread).length;
}

/**
 * Destino navegável de uma notificação. Hoje só `action` tem rota própria;
 * `deliverable` aponta para a ação pai (onde entregáveis são exibidos) e só é
 * resolvido quando o mapa deliverable→action foi carregado — nunca inventamos
 * schema nem rota. Tipos desconhecidos não geram link.
 */
export type NotificationTarget = { type: "action"; actionId: string } | null;

export function notificationTarget(
  item: Pick<NotificationItem, "entityType" | "entityId">,
  deliverableActionMap?: ReadonlyMap<string, string>,
): NotificationTarget {
  if (!item.entityId) return null;
  if (item.entityType === "action") {
    return { type: "action", actionId: item.entityId };
  }
  if (item.entityType === "deliverable") {
    const actionId = deliverableActionMap?.get(item.entityId);
    return actionId ? { type: "action", actionId } : null;
  }
  return null;
}

/** Data/hora local em PT-BR; entrada inválida devolve string vazia. */
export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const SELECT_COLUMNS =
  "id, notification_type, title, body, entity_type, entity_id, read_at, created_at";

export type NotificationListItem = NotificationItem & { target: NotificationTarget };

/**
 * Mapa deliverable_id → action_id para resolver links de notificações de
 * entregáveis. Falha aqui NÃO derruba a listagem: os links ficam
 * indisponíveis e o restante da central funciona.
 */
async function fetchDeliverableActionMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await client()
    .from("deliverables")
    .select("id, action_id")
    .in("id", ids);
  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "notifications.resolve_deliverable_links", supabase_error: sanitize(error) },
    });
    return map;
  }
  for (const row of (data ?? []) as { id: string; action_id: string }[]) {
    map.set(row.id, row.action_id);
  }
  return map;
}

/** Lista as notificações do usuário autenticado (RLS limita ao recipient). */
export async function listNotifications(limit = 50): Promise<NotificationListItem[]> {
  const { data, error } = await client()
    .from("notifications")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "notifications.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as notificações.");
  }

  const items = ((data ?? []) as NotificationRow[]).map(mapNotification);
  const deliverableIds = items
    .filter((i) => i.entityType === "deliverable" && i.entityId)
    .map((i) => i.entityId as string);
  const map = await fetchDeliverableActionMap(deliverableIds);
  return items.map((item) => ({ ...item, target: notificationTarget(item, map) }));
}

/** Contagem server-side de não lidas (RLS limita ao recipient). */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await client()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "notifications.unread_count", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível contar as notificações não lidas.");
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Marcação de leitura (UPDATE permitido somente ao próprio recipient)
// ---------------------------------------------------------------------------

/** Marca uma notificação como lida. Idempotente: já lida é no-op. */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await client()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "notifications.mark_as_read", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível marcar a notificação como lida.");
  }
  notifyChanged();
}

/** Marca TODAS as notificações não lidas do usuário como lidas (escopo RLS). */
export async function markAllAsRead(): Promise<void> {
  const { error } = await client()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "notifications.mark_all_as_read", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível marcar todas as notificações como lidas.");
  }
  notifyChanged();
}
