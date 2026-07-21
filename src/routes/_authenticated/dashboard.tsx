import { createFileRoute } from "@tanstack/react-router";
import { Activity, ListChecks, Users, Ship } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · DP Suite" },
      { name: "description", content: "Visão geral da governança DP da sua organização." },
    ],
  }),
  component: DashboardPage,
});

const kpis = [
  { label: "Ações abertas", value: "—", icon: ListChecks },
  { label: "Embarcações ativas", value: "—", icon: Ship },
  { label: "Usuários", value: "—", icon: Users },
  { label: "Eventos recentes", value: "—", icon: Activity },
];

function DashboardPage() {
  const { user, profile } = Route.useRouteContext();
  const displayName = profile.fullName ?? user.email ?? "Usuário";
  const organizationName = profile.organizationName ?? "Organização não vinculada";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={`Olá, ${displayName}`}
        description={`Painel da organização ${organizationName}.`}
        actions={<Badge variant="secondary">TT-006 · Shell</Badge>}
      />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">Dados chegam nas próximas tasks</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo ao DP Suite</CardTitle>
          <CardDescription>
            A casca do aplicativo está pronta. Cada módulo receberá suas telas específicas em
            tarefas subsequentes do backlog.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
