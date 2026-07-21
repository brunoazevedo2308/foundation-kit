import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Usuários · DP Suite" },
      { name: "description", content: "Gestão de usuários da organização." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Usuários"
      description="Perfis, papéis e atribuições dos usuários da organização."
      icon={Users}
      eta="Próximas tasks"
      bullets={[
        "Convite e onboarding de perfis",
        "Ativação, inativação e bloqueio",
        "Atribuição a embarcações",
        "Papéis e permissões operacionais",
      ]}
    />
  ),
});
