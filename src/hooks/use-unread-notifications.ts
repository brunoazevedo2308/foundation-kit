import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fetchUnreadCount, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications";

/**
 * US-006 — contador de notificações não lidas para o shell (badge).
 *
 * Sem polling agressivo: busca na montagem, re-busca a cada mudança de rota
 * (navegação é o momento natural de atualização) e sempre que uma mutação de
 * leitura local disparar `NOTIFICATIONS_CHANGED_EVENT`.
 *
 * O estado vive num store de módulo compartilhado: header e sidebar montam o
 * mesmo hook, mas fazem **uma única** requisição por gatilho (deduplicação por
 * promise em voo). Falhas são silenciosas na UI (o badge simplesmente não
 * aparece) e já ficam registradas na observabilidade pela camada de dados.
 *
 * Retorna `null` enquanto não há contagem disponível.
 */

let currentCount: number | null = null;
let inFlight: Promise<void> | null = null;
let lastKey: string | null = null;
const subscribers = new Set<(value: number | null) => void>();

function publish(value: number | null) {
  currentCount = value;
  for (const notify of subscribers) notify(value);
}

/** Dispara uma busca deduplicada; `key` evita refetch redundante por rota. */
function refresh(key?: string) {
  if (key !== undefined) {
    if (key === lastKey && currentCount !== null) return;
    lastKey = key;
  }
  if (inFlight) return;
  inFlight = fetchUnreadCount()
    .then((value) => publish(value))
    .catch(() => publish(null))
    .finally(() => {
      inFlight = null;
    });
}

export function useUnreadNotifications(): number | null {
  const [count, setCount] = useState<number | null>(currentCount);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    subscribers.add(setCount);
    setCount(currentCount);
    return () => {
      subscribers.delete(setCount);
    };
  }, []);

  useEffect(() => {
    refresh(pathname);
  }, [pathname]);

  useEffect(() => {
    const onChanged = () => {
      lastKey = null;
      refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, []);

  return count;
}
