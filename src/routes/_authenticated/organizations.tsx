import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

/**
 * US-005 — landing (index) das Organizations.
 *
 * Rota disponível apenas para `system_admin` ativos. Usuários sem esse papel
 * são redirecionados para `/dashboard`, mantendo a segregação observada na
 * sidebar. Nesta entrega, a listagem completa (paginação, filtros, edição)
 * ainda não existe — exibimos a Organization real do contexto do usuário
 * atual, sem dados fictícios, e o CTA para cadastrar uma nova.
 */
export const Route = createFileRoute("/_authenticated/organizations")({
  head: () => ({
    meta: [
      { title: "Organizations · DP Suite" },
      { name: "description", content: "Administração de organizações do DP Suite." },
    ],
  }),
  beforeLoad: ({ context }) => {
    const role = context.profile?.role;
    if (role !== "system_admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OrganizationsIndex,
});

function OrganizationsIndex() {
  const { profile } = Route.useRouteContext();
  const orgName = profile.organizationName;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Gestão de organizações do DP Suite."
        actions={
          <Button asChild>
            <Link to="/organizations/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova Organization
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="current-org-heading" className="space-y-3">
        <h2
          id="current-org-heading"
          className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
        >
          Sua organização atual
        </h2>
        {orgName ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">{orgName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Organização vinculada ao seu perfil neste contexto.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Seu perfil ainda não está vinculado a uma organização.
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A listagem completa de organizações chega em uma próxima entrega. Nesta versão apenas o
        cadastro está disponível.
      </p>
    </div>
  );
}
