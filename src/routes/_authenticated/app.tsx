import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy landing target. TT-006 promotes `/dashboard` to the canonical home
 * of the authenticated area — `/app` is preserved as a permanent redirect so
 * existing bookmarks continue to work.
 */
export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
