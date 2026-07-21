import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/actions")({
  head: () => ({
    meta: [
      { title: "Ações · DP Suite" },
      { name: "description", content: "Gestão de ações operacionais DP." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Ações"
      description="Planejamento, priorização e acompanhamento de ações operacionais DP."
      icon={ListChecks}
      eta="Próximas tasks"
      bullets={[
        "Listagem por status, prioridade e criticidade",
        "Filtros por cliente, embarcação e responsável",
        "Vínculo com deliverables e evidências",
        "Auditoria de mudanças por usuário",
      ]}
    />
  ),
});
