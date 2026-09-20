import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Layout protegido do módulo de Organizations.
 *
 * O conteúdo das páginas fica nas rotas filhas (`index` e `new`). Manter o
 * `Outlet` aqui é essencial para que `/organizations/new` renderize o
 * formulário em vez de repetir a landing do módulo.
 */
export const Route = createFileRoute("/_authenticated/organizations")({
  beforeLoad: ({ context }) => {
    if (context.profile?.role !== "system_admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
