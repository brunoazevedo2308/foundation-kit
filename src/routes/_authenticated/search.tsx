import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Busca · DP Suite" },
      { name: "description", content: "Busca global na governança DP." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Busca"
      description="Busca global entre ações, deliverables, clientes e embarcações."
      icon={Search}
      eta="Próximas tasks"
      bullets={[
        "Índice unificado por Organization",
        "Filtros por entidade e status",
        "Atalhos de teclado",
        "Histórico e sugestões",
      ]}
    />
  ),
});
