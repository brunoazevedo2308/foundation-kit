import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { cn } from "@/lib/utils";

/**
 * US-006 — badge de notificações não lidas reutilizável (header e sidebar).
 *
 * `count`: pill com o número (99+ acima de 99). `dot`: indicador mínimo para
 * a sidebar colapsada. Renderiza `null` quando não há não lidas ou a contagem
 * ainda não está disponível.
 *
 * `decorative` marca o badge como `aria-hidden` — usar quando o elemento pai
 * (link/botão) já anuncia a contagem no seu próprio `aria-label`, evitando
 * leitura duplicada ou rótulo aninhado ignorado pelo leitor de tela.
 */
export function NotificationBadge({
  variant = "count",
  decorative = false,
  className,
}: {
  variant?: "count" | "dot";
  decorative?: boolean;
  className?: string;
}) {
  const count = useUnreadNotifications();
  if (!count || count <= 0) return null;

  if (variant === "dot") {
    return (
      <span
        {...(decorative ? { "aria-hidden": true } : { "aria-label": "Há notificações não lidas" })}
        className={cn(
          "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive",
          className,
        )}
      />
    );
  }

  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { "aria-label": `${count} notificações não lidas` })}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
