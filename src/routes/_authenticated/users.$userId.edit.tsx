import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppRole, ProfileStatus } from "@/lib/auth";
import { getUser, updateUserAccess, type UserAccessInput, type UserListItem } from "@/lib/users";

export const Route = createFileRoute("/_authenticated/users/$userId/edit")({
  head: () => ({ meta: [{ title: "Editar acesso · DP Suite" }] }),
  beforeLoad: ({ context }) => {
    if (!context.profile || context.profile.role === "member") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: EditUserAccessPage,
});

function EditUserAccessPage() {
  const { userId } = Route.useParams();
  const { user: currentUser, profile } = Route.useRouteContext();
  const [target, setTarget] = useState<UserListItem | null>(null);
  const [values, setValues] = useState<UserAccessInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = useMemo<AppRole[]>(
    () =>
      profile.role === "system_admin"
        ? ["system_admin", "organization_admin", "member"]
        : ["organization_admin", "member"],
    [profile.role],
  );

  useEffect(() => {
    let active = true;
    if (userId === currentUser.id) {
      setError("Você não pode alterar o próprio papel ou status.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    getUser(userId)
      .then((row) => {
        if (!active) return;
        if (profile.role === "organization_admin" && row.role === "system_admin") {
          setError("Você não tem permissão para alterar este usuário.");
          return;
        }
        setTarget(row);
        setValues({ role: row.role, status: row.status });
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar o usuário.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser.id, profile.role, userId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateUserAccess(userId, values);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar acesso"
        description={target?.fullName ?? "Papel e situação do usuário."}
      />
      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando usuário...
        </div>
      ) : values && target ? (
        <form onSubmit={onSubmit} className="max-w-xl space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role">Papel</Label>
              <Select
                value={values.role}
                onValueChange={(value) => {
                  setValues((current) =>
                    current ? { ...current, role: value as AppRole } : current,
                  );
                  setSaved(false);
                }}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => {
                  setValues((current) =>
                    current ? { ...current, status: value as ProfileStatus } : current,
                  );
                  setSaved(false);
                }}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="blocked">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {saved ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Acesso atualizado com sucesso.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar acesso"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/users">Voltar</Link>
            </Button>
          </div>
        </form>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function roleLabel(role: AppRole) {
  if (role === "system_admin") return "Administrador do sistema";
  if (role === "organization_admin") return "Administrador da organização";
  return "Membro";
}
