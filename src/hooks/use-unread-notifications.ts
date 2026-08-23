import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fetchUnreadCount, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications";

/**
 * US-006 — contador de notificações não lidas para o shell (badge).
 *
 * Sem polling agressivo: busca na montagem, re-busca a cada mudança de rota
 * (navegação é o momento natural de atualização) e sempre que uma mutação de
 * leitura local disparar `NOTIFICATIONS_CHANGED_EVENT`. Falhas são silenciosas
 * na UI (o badge simplesmente não aparece) e já ficam registradas na
 * observabilidade pela camada de dados.
 *
 * Retorna `null` enquanto não há contagem disponível.
 */
export function useUnreadNotifications(): number | null {
  const [count, setCount] = useState<number | null>(null);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetchUnreadCount()
        .then((value) => {
          if (active) setCount(value);
        })
        .catch(() => {
          if (active) setCount(null);
        });
    };
    refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  return count;
}
