import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configurações · DP Suite" },
      { name: "description", content: "Configurações da conta e da organização." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Configurações"
      description="Preferências da conta, organização e integrações."
      icon={Settings}
      eta="Próximas tasks"
      bullets={[
        "Perfil pessoal e segurança",
        "Dados da organização",
        "Preferências de notificação",
        "Integrações e chaves de API",
      ]}
    />
  ),
});
