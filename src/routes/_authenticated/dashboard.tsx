import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarClock, ListChecks, PackageCheck } from "lucide-react";

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

const placeholders = [
  {
    label: "Ações",
    icon: ListChecks,
    description: "Lista de ações de governança DP aparecerá aqui em uma task futura.",
  },
  {
    label: "Itens vencidos",
    icon: CalendarClock,
    description: "Ações e deliverables vencidos serão listados aqui em uma task futura.",
  },
  {
    label: "Deliverables",
    icon: PackageCheck,
    description: "Entregáveis vinculados às ações aparecerão aqui em uma task futura.",
  },
  {
    label: "Atividade recente",
    icon: Activity,
    description: "Eventos e auditoria recentes aparecerão aqui em uma task futura.",
  },
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
      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Resumo do dashboard"
      >
        {placeholders.map(({ label, icon: Icon, description }) => (
          <Card key={label} className="opacity-80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-muted-foreground">—</p>
              <p className="mt-2 text-xs text-muted-foreground">{description}</p>
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
