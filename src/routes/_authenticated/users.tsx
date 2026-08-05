import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * US-003 — layout do módulo de usuários.
 *
 * Concentra o gate de RBAC (membros não acessam o módulo) e renderiza os
 * filhos `/users` (listagem) e `/users/new` (convite) via <Outlet />.
 */
export const Route = createFileRoute("/_authenticated/users")({
  beforeLoad: ({ context }) => {
    if (!context.profile || context.profile.role === "member") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
