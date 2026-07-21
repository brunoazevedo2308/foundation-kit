import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotFoundPage } from "@/components/status-pages";
import { fetchProfileHeader, fetchProfileStatus } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * DP Suite — pathless authenticated layout (TT-005 + TT-006).
 *
 * Any route under `src/routes/_authenticated/` is gated by this layout and
 * wrapped in the responsive `AppShell` (sidebar + header + breadcrumb).
 * SSR is disabled because the Supabase session lives in the browser's
 * localStorage and cannot be read during server rendering.
 *
 * The gate always revalidates the caller's `profile_status` before any
 * protected content renders — a session restored from localStorage for an
 * account demoted to `inactive` or `blocked` after its last sign-in is
 * signed out here, not shown protected UI first.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!supabase) {
      throw redirect({ to: "/login" });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }

    const status = await fetchProfileStatus(data.user.id);
    if (status !== "active") {
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }

    const header = await fetchProfileHeader(data.user.id);
    return { user: data.user, profile: header };
  },
  component: AuthenticatedLayout,
  notFoundComponent: () => <NotFoundPage />,
});

function AuthenticatedLayout() {
  const { user, profile } = Route.useRouteContext();
  const displayName = profile.fullName ?? user.email ?? "Usuário";
  const organizationName = profile.organizationName ?? "Organização não vinculada";
  return (
    <AppShell
      displayName={displayName}
      organizationName={organizationName}
      email={user.email ?? ""}
    >
      <Outlet />
    </AppShell>
  );
}
