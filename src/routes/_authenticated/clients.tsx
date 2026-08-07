import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * US-004 — layout do módulo de clientes.
 *
 * A leitura é permitida a qualquer perfil ativo da organização (RLS já
 * isola por tenant). O gate de cadastro fica na rota `/clients/new`.
 */
export const Route = createFileRoute("/_authenticated/clients")({
  component: () => <Outlet />,
});
