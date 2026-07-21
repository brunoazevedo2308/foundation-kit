import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";

/**
 * DP Suite — controlled access-blocked screen (TT-006).
 *
 * Public route (no auth gate). Reached when a signed-in session belongs to
 * a profile whose lifecycle status is `inactive`, `blocked`, or missing /
 * soft-deleted. The `_authenticated` gate signs the user out first and then
 * routes here so they land on a stable explanation page instead of a raw
 * `/login` bounce with no context.
 */

const StatusSchema = z.enum(["inactive", "blocked", "unknown"]).catch("unknown");

export const Route = createFileRoute("/access-blocked")({
  ssr: false,
  validateSearch: (search) => ({ status: StatusSchema.parse(search.status) }),
  head: () => ({
    meta: [
      { title: "Acesso indisponível · DP Suite" },
      {
        name: "description",
        content: "Este acesso ao DP Suite está temporariamente indisponível.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessBlockedPage,
});

const COPY = {
  inactive: {
    title: "Conta inativa",
    description:
      "Sua conta está marcada como inativa. Peça ao administrador da sua organização para reativá-la.",
  },
  blocked: {
    title: "Acesso bloqueado",
    description:
      "Seu acesso ao DP Suite está bloqueado. Contate o administrador da sua organização para saber mais.",
  },
  unknown: {
    title: "Acesso indisponível",
    description:
      "Não conseguimos validar seu perfil. Contate o administrador da sua organização para verificar sua vinculação.",
  },
} as const;

function AccessBlockedPage() {
  const { status } = useSearch({ from: "/access-blocked" }) as {
    status: keyof typeof COPY;
  };
  const copy = COPY[status];
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/login">Voltar para o login</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Página inicial</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
