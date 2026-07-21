import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Landmark, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

/**
 * US-005 — landing (index) das Organizations.
 *
 * Rota disponível apenas para `system_admin` ativos. Usuários sem esse
 * papel são redirecionados para `/dashboard`, mantendo a segregação
 * observada na sidebar. A listagem completa (paginação, filtros, edição)
 * chega em uma US posterior — por enquanto exibimos um placeholder
 * profissional e a ação primária "Nova Organization".
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
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
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
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        A listagem completa de organizações chega em uma próxima entrega. Nesta versão, apenas o
        cadastro está disponível.
      </div>
    </div>
  );
}
