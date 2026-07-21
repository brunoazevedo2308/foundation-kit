import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert, FileQuestion } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shared full-viewport status pages (loading / forbidden / not-found) used by
 * the authenticated shell so every module falls back to the same visuals.
 */

function StatusScreen({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid min-h-[60vh] w-full place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {actions ? <div className="mt-6 flex justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function LoadingPage({ label = "Carregando..." }: { label?: string }) {
  return (
    <StatusScreen
      icon={<Loader2 className="h-6 w-6 animate-spin" />}
      title={label}
      description="Buscando dados com segurança em sua organização."
    />
  );
}

export function ForbiddenPage({
  description = "Você não tem permissão para acessar este recurso. Se acredita ser um engano, contate o administrador da sua organização.",
}: {
  description?: string;
}) {
  return (
    <StatusScreen
      icon={<ShieldAlert className="h-6 w-6" />}
      title="Acesso negado"
      description={description}
      actions={
        <Button asChild variant="outline">
          <Link to="/dashboard">Voltar ao painel</Link>
        </Button>
      }
    />
  );
}

export function NotFoundPage({
  description = "A página que você procura não existe ou foi movida.",
}: {
  description?: string;
}) {
  return (
    <StatusScreen
      icon={<FileQuestion className="h-6 w-6" />}
      title="Página não encontrada"
      description={description}
      actions={
        <>
          <Button asChild>
            <Link to="/dashboard">Ir para o painel</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Página inicial</Link>
          </Button>
        </>
      }
    />
  );
}
