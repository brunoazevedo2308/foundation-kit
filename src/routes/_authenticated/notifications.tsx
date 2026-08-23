import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, BellOff, Check, CheckCheck, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  countUnread,
  formatNotificationTimestamp,
  isUnread,
  listNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationListItem,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * US-006 (1º ciclo) — Central de Notificações.
 *
 * Lista as notificações do próprio usuário (RLS: somente recipient/tenant),
 * com destaque de não lidas, marcação individual e em massa de leitura e
 * links para a entidade de origem quando há destino suportado. A geração
 * automática de notificações NÃO faz parte deste ciclo.
 */
export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações · DP Suite" },
      { name: "description", content: "Central de notificações do usuário." },
      { property: "og:title", content: "Notificações · DP Suite" },
      { property: "og:description", content: "Central de notificações do usuário." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [busyAll, setBusyAll] = useState(false);

  useEffect(() => {
    let active = true;
    listNotifications()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar as notificações.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const unreadCount = countUnread(items);

  async function handleMarkAsRead(notification: NotificationListItem) {
    setError(null);
    setBusyIds((current) => new Set(current).add(notification.id));
    try {
      await markAsRead(notification.id);
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, readAt } : n)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a notificação.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  }

  async function handleMarkAllAsRead() {
    setError(null);
    setBusyAll(true);
    try {
      await markAllAsRead();
      const readAt = new Date().toISOString();
      setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar as notificações.");
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notificações"
        description="Alertas operacionais e de conformidade direcionados a você."
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={handleMarkAllAsRead} disabled={busyAll}>
              <CheckCheck className="mr-2 h-4 w-4" />
              {busyAll ? "Marcando..." : `Marcar todas como lidas (${unreadCount})`}
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando notificações...
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <BellOff className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhuma notificação por aqui.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando houver eventos relevantes para você, eles aparecerão nesta central.
          </p>
        </div>
      ) : items.length > 0 ? (
        <ul className="space-y-2" aria-label="Lista de notificações">
          {items.map((notification) => {
            const unread = isUnread(notification);
            const busy = busyIds.has(notification.id);
            return (
              <li
                key={notification.id}
                className={cn(
                  "rounded-lg border p-4",
                  unread ? "border-primary/40 bg-primary/5" : "border-border bg-background",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      unread ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p
                        className={cn(
                          "text-sm",
                          unread ? "font-semibold" : "font-medium text-muted-foreground",
                        )}
                      >
                        {notification.title}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatNotificationTimestamp(notification.createdAt)}
                      </span>
                    </div>
                    {notification.body ? (
                      <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {notification.target ? (
                        <Button asChild variant="link" size="sm" className="h-auto px-0">
                          <Link
                            to="/actions/$actionId"
                            params={{ actionId: notification.target.actionId }}
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            Ver ação
                          </Link>
                        </Button>
                      ) : null}
                      {unread ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-1 text-xs"
                          disabled={busy}
                          onClick={() => handleMarkAsRead(notification)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {busy ? "Marcando..." : "Marcar como lida"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && items.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="h-3.5 w-3.5" aria-hidden />
          Exibindo as {items.length} notificações mais recentes.
        </p>
      ) : null}
    </div>
  );
}
