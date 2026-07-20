import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { env, isSupabaseConfigured } from "@/lib/env";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DP Suite — Dynamic Positioning Governance" },
      {
        name: "description",
        content: "DP Suite: governança e conformidade para operações de Dynamic Positioning.",
      },
      { property: "og:title", content: "DP Suite" },
      {
        property: "og:description",
        content: "Plataforma SaaS de governança para operações de Dynamic Positioning.",
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
        <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">DP Suite</h1>
        <p className="mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          Governança e conformidade para operações de Dynamic Positioning. Fundação técnica
          inicializada — pronto para receber as próximas entregas.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" disabled>
            Em breve
          </Button>
          <Button size="lg" variant="outline" disabled>
            Documentação
          </Button>
        </div>
        <div className="mt-16 flex flex-col items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <p>Stack: TypeScript · React · Tailwind · shadcn/ui · TanStack Start</p>
          <div className="flex items-center gap-2 normal-case tracking-normal">
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              env: {env.appEnv}
            </span>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium " +
                (isSupabaseConfigured
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400")
              }
              aria-live="polite"
            >
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (isSupabaseConfigured ? "bg-emerald-500" : "bg-amber-500")
                }
              />
              backend: {isSupabaseConfigured ? "configurado" : "pendente"}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
