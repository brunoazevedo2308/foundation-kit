import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * US-004 — layout do módulo de embarcações.
 */
export const Route = createFileRoute("/_authenticated/vessels")({
  component: () => <Outlet />,
});
