import { createFileRoute } from "@tanstack/react-router";
import { Ship } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/vessels")({
  head: () => ({
    meta: [
      { title: "Embarcações · DP Suite" },
      { name: "description", content: "Frota DP governada pela organização." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Embarcações"
      description="Frota DP vinculada aos clientes da organização."
      icon={Ship}
      eta="Próximas tasks"
      bullets={[
        "Cadastro com IMO e status operacional",
        "Vínculo cliente ↔ embarcação",
        "Atribuição de usuários (user_vessels)",
        "Histórico de operações e evidências",
      ]}
    />
  ),
});
