import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

/**
 * Minimal authenticated landing page (TT-005). The full application shell
 * is intentionally out of scope — this route only confirms that session
 * gating and sign-out are wired end-to-end.
 */
export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "DP Suite · Área autenticada" },
      { name: "description", content: "Área autenticada do DP Suite." },
    ],
  }),
  component: AuthenticatedHome,
});

function AuthenticatedHome() {
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      await router.navigate({ to: "/auth", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center px-6 py-24">
        <span className="mb-4 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          TT-005 · Sessão autenticada
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Você está autenticado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sessão ativa como <span className="font-medium text-foreground">{user.email}</span>. A
          casca do aplicativo (navegação, menus, dashboards) chega em TT-006.
        </p>
        <div className="mt-8">
          <Button onClick={handleSignOut} disabled={busy} variant="outline">
            {busy ? "Saindo..." : "Sair"}
          </Button>
        </div>
      </div>
    </main>
  );
}
