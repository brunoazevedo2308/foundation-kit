import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { LoadingPage, NotFoundPage } from "@/components/status-pages";
import { fetchProfileHeader, fetchProfileStatus } from "@/lib/auth";
import { buildLoginRedirectSearch } from "@/lib/return-path";
import { supabase } from "@/lib/supabase";

/**
 * DP Suite — pathless authenticated layout (TT-005 + TT-006).
 *
 * Any route under `src/routes/_authenticated/` is gated by this layout and
 * wrapped in the responsive `AppShell` (sidebar + header + breadcrumb).
 * SSR is disabled because the Supabase session lives in the browser's
 * localStorage and cannot be read during server rendering.
 *
 * Gate outcomes:
 * - No Supabase client / no session → redirect to `/login` preserving a
 *   safe same-origin return path so the user lands back where they came
 *   from after signing in.
 * - Session valid but profile is `inactive` / `blocked` / missing /
 *   soft-deleted → sign the user out and route to `/access-blocked` with a
 *   controlled explanation, never to a raw `/login` bounce.
 * - Session valid and profile active → render the shell with the current
 *   user's display data.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!supabase) {
      throw redirect({
        to: "/login",
        search: buildLoginRedirectSearch(location.pathname + location.searchStr),
      });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/login",
        search: buildLoginRedirectSearch(location.pathname + location.searchStr),
      });
    }

    const status = await fetchProfileStatus(data.user.id);
    if (status !== "active") {
      await supabase.auth.signOut();
      throw redirect({
        to: "/access-blocked",
        search: { status: status === "inactive" ? "inactive" : "blocked" },
      });
    }

    const header = await fetchProfileHeader(data.user.id);
    return { user: data.user, profile: header };
  },
  component: AuthenticatedLayout,
  pendingComponent: () => <LoadingPage label="Validando sua sessão..." />,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: AuthenticatedErrorBoundary,
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

function AuthenticatedErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  return (
    <div className="grid min-h-[60vh] w-full place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi possível carregar esta área do DP Suite. Tente novamente em alguns instantes.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
