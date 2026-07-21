import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

/**
 * TT-006 — dynamic Action detail route.
 *
 * File name uses TanStack Start's flat convention: `actions.$actionId.tsx`
 * maps to `/actions/$actionId`. This ships as a shell-ready placeholder;
 * real Action detail UI, loader data and mutations arrive in a later task.
 */
export const Route = createFileRoute("/_authenticated/actions/$actionId")({
  head: () => ({
    meta: [
      { title: "Detalhe da ação · DP Suite" },
      { name: "description", content: "Detalhe de uma ação DP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActionDetailPage,
});

function ActionDetailPage() {
  const { actionId } = Route.useParams();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Detalhe da ação"
        description="A UI completa desta tela chega em tarefas seguintes do backlog."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/actions" className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar para Ações
            </Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">Ação #{actionId}</CardTitle>
              <CardDescription>
                Placeholder de detalhe — nenhum dado de negócio é buscado neste momento.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="ml-auto">
              Em preparação
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta rota valida a convenção de parâmetros dinâmicos do TanStack Start
          (<code className="rounded bg-muted px-1 py-0.5 text-xs">/actions/$actionId</code>) e serve
          de âncora para os próximos passos: loader com RLS, mutações e histórico de auditoria.
        </CardContent>
      </Card>
    </div>
  );
}
