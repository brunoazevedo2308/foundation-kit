import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * US-004 (2º ciclo) — layout do módulo de ações.
 *
 * Leitura liberada a qualquer perfil ativo (RLS isola por organização);
 * o gate de criação fica em `/actions/new`.
 */
export const Route = createFileRoute("/_authenticated/actions")({
  component: () => <Outlet />,
});
