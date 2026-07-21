import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listUsers, type UserListItem } from "@/lib/users";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Usuários · DP Suite" },
      { name: "description", content: "Gestão de usuários da organização." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || context.profile.role === "member") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: UsersPage,
});

const ROLE_LABELS = {
  system_admin: "Administrador do sistema",
  organization_admin: "Administrador da organização",
  member: "Membro",
} as const;

const STATUS_LABELS = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
} as const;

function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listUsers()
      .then((rows) => {
        if (active) setUsers(rows);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Perfis, papéis e situação de acesso dos usuários."
        actions={
          <Button asChild>
            <Link to="/users/new">
              <Plus className="mr-2 h-4 w-4" />
              Convidar usuário
            </Link>
          </Button>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando usuários...
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhum usuário disponível.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie o primeiro convite para começar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.fullName ?? "Nome não informado"}
                  </TableCell>
                  <TableCell>{user.organizationName ?? "Global / não vinculada"}</TableCell>
                  <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABELS[user.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLoginAt
                      ? new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(user.lastLoginAt))
                      : "Nunca"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
