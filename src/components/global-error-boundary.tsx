import { Component, type ErrorInfo, type ReactNode } from "react";

import { emitEvent, generateCorrelationId, sanitize } from "@/lib/observability";

/**
 * DP Suite — Global Error Boundary (TT-008).
 *
 * Captura erros críticos de renderização, exibe uma tela em português
 * com o correlation ID visível e emite um evento `ui.error_boundary.caught`
 * através do módulo central de observabilidade. Nunca imprime a mensagem
 * bruta do erro ao usuário — apenas o correlation ID, útil para o time
 * de suporte cruzar com os logs.
 */

interface State {
  hasError: boolean;
  correlationId: string | null;
}

interface Props {
  children: ReactNode;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, correlationId: null };

  static getDerivedStateFromError(): State {
    return { hasError: true, correlationId: generateCorrelationId() };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    emitEvent({
      event_name: "ui.error_boundary.caught",
      severity: "critical",
      correlation_id: this.state.correlationId ?? undefined,
      context: {
        error: sanitize(error),
        componentStack: info.componentStack ?? undefined,
      },
    });
  }

  private handleReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const cid = this.state.correlationId ?? "—";
    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center bg-background px-4 py-12"
      >
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Ocorreu um erro inesperado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A página não pôde ser exibida. Nossa equipe já registrou este incidente. Você pode
            tentar recarregar a página.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            ID de correlação:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{cid}</code>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Recarregar
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Ir para o início
            </a>
          </div>
        </div>
      </div>
    );
  }
}
