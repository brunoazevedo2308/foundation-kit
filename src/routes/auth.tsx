import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/auth` route from the pre-split TT-005 draft. Kept purely as a
 * permanent redirect to `/login` so any bookmarked/linked URL stays valid.
 * The active auth surfaces are `/login` and `/forgot-password`.
 */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
