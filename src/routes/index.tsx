import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Always lead visitors into the authenticated application. The existing
 * authentication gate sends visitors without a valid session to `/login` and
 * preserves `/dashboard` as their return path.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
