import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

/**
 * Minimal authenticated landing page (TT-005). The full application shell
 * is intentionally out of scope — this route confirms that session gating,
 * profile-status revalidation, and profile/organization display are wired
 * end-to-end.
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
  const { user, profile } = Route.useRouteContext();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      await router.navigate({ to: "/login", replace: true });
    } finally {
      setBusy(false);
    }
  }

  const displayName = profile.fullName ?? user.email ?? "Usuário";
  const organizationName = profile.organizationName ?? "Organização não vinculada";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center px-6 py-24">
        <span className="mb-4 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          TT-005 · Sessão autenticada
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Olá, {displayName}</h1>
        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">Perfil</dt>
            <dd className="mt-1 font-medium text-foreground">{displayName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              Organização
            </dt>
            <dd className="mt-1 font-medium text-foreground">{organizationName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">Conta</dt>
            <dd className="mt-1 font-mono text-xs text-muted-foreground">{user.email}</dd>
          </div>
        </dl>
        <p className="mt-8 text-sm text-muted-foreground">
          A casca do aplicativo (navegação, menus, dashboards) chega em TT-006.
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
