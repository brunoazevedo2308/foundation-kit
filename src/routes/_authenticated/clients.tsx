import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clientes · DP Suite" },
      { name: "description", content: "Cadastro de clientes da organização." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Clientes"
      description="Cadastro dos clientes cujas operações DP são governadas por esta organização."
      icon={Building2}
      eta="Próximas tasks"
      bullets={[
        "CRUD com validação de código único",
        "Vínculo com embarcações",
        "Soft-delete e histórico",
        "Isolamento por Organization (RLS)",
      ]}
    />
  ),
});
