import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DP Suite — Dynamic Positioning Governance" },
      {
        name: "description",
        content:
          "DP Suite: governança e conformidade para operações de Dynamic Positioning.",
      },
      { property: "og:title", content: "DP Suite" },
      {
        property: "og:description",
        content:
          "Plataforma SaaS de governança para operações de Dynamic Positioning.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-6 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          TT-001 · Foundation
        </span>
        <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
          DP Suite
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          Governança e conformidade para operações de Dynamic Positioning.
          Fundação técnica inicializada — pronto para receber as próximas
          entregas.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" disabled>
            Em breve
          </Button>
          <Button size="lg" variant="outline" disabled>
            Documentação
          </Button>
        </div>
        <p className="mt-16 text-xs uppercase tracking-widest text-muted-foreground">
          Stack: TypeScript · React · Tailwind · shadcn/ui · TanStack Start
        </p>
      </div>
    </main>
  );
}
