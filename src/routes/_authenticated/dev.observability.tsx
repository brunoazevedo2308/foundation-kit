import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import {
  emitEvent,
  generateCorrelationId,
  getSessionCorrelationId,
} from "@/lib/observability";

/**
 * Rota protegida disponível somente em Development. Permite disparar um
 * erro controlado e visualizar o correlation ID emitido — usada para
 * validar a instrumentação sem depender de bugs reais. Em qualquer
 * ambiente que não seja `development`, o `beforeLoad` redireciona para
 * `/dashboard` e a rota fica efetivamente indisponível.
 */
export const Route = createFileRoute("/_authenticated/dev/observability")({
  beforeLoad: () => {
    if (env.appEnv !== "development") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: DevObservabilityPage,
});

function DevObservabilityPage() {
  const [lastCorrelationId, setLastCorrelationId] = useState<string | null>(null);
  const [lastEventName, setLastEventName] = useState<string | null>(null);
  const [thrown, setThrown] = useState<Error | null>(null);

  function triggerEvent() {
    const correlationId = generateCorrelationId();
    emitEvent({
      event_name: "dev.controlled_error",
      severity: "error",
      correlation_id: correlationId,
      context: { source: "dev.observability_page", intent: "manual_trigger" },
    });
    setLastCorrelationId(correlationId);
    setLastEventName("dev.controlled_error");
  }

  function triggerBoundary() {
    setThrown(new Error("Erro controlado disparado a partir de /dev/observability"));
  }

  if (thrown) {
    // Faz o Error Boundary global capturar o erro.
    throw thrown;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico de observabilidade"
        description="Ferramenta interna disponível apenas em Development. Permite emitir eventos controlados e verificar o correlation ID gerado."
      />

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Sessão atual</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Correlation ID de sessão:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {getSessionCorrelationId()}
          </code>
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Emitir evento controlado</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Dispara um evento <code>dev.controlled_error</code> com correlation ID único e o exibe
          abaixo. Nada de PII é registrado.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={triggerEvent}>
            Emitir evento
          </Button>
          <Button type="button" variant="destructive" onClick={triggerBoundary}>
            Disparar erro de renderização
          </Button>
        </div>
        {lastCorrelationId && (
          <p className="mt-4 text-xs text-muted-foreground">
            Último evento: <strong>{lastEventName}</strong> — correlation ID{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {lastCorrelationId}
            </code>
          </p>
        )}
      </section>
    </div>
  );
}
