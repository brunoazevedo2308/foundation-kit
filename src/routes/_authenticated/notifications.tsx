import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações · DP Suite" },
      { name: "description", content: "Central de notificações do usuário." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      title="Notificações"
      description="Central de notificações operacionais e de conformidade."
      icon={Bell}
      eta="Próximas tasks"
      bullets={[
        "Feed pessoal com marcação de leitura",
        "Notificações de ações, deliverables e comentários",
        "Preferências por canal",
        "Auditoria de entrega",
      ]}
    />
  ),
});
