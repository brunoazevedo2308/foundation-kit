import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canManageOperationalData, listClients, type ClientListItem } from "@/lib/clients";
import {
  VesselFormSchema,
  createVessel,
  type VesselFormInput,
  type VesselListItem,
} from "@/lib/vessels";

export const Route = createFileRoute("/_authenticated/vessels/new")({
  head: () => ({
    meta: [
      { title: "Nova embarcação · DP Suite" },
      { name: "description", content: "Cadastro de uma nova embarcação da frota DP." },
      { property: "og:title", content: "Nova embarcação · DP Suite" },
      { property: "og:description", content: "Cadastro de uma nova embarcação da frota DP." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/vessels" });
    }
  },
  component: NewVesselPage,
});

type FieldErrors = Partial<Record<keyof VesselFormInput, string>>;

const NO_CLIENT = "__none__";

const EMPTY: VesselFormInput = {
  name: "",
  imoNumber: "",
  vesselType: "",
  dpClass: "",
  status: "active",
  clientId: "",
};

function NewVesselPage() {
  const [values, setValues] = useState<VesselFormInput>(EMPTY);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<VesselListItem | null>(null);

  useEffect(() => {
    let active = true;
    listClients()
      .then((rows) => {
        if (active) setClients(rows);
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar os clientes para vínculo.");
      })
      .finally(() => {
        if (active) setLoadingClients(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof VesselFormInput>(key: K, value: VesselFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = VesselFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof VesselFormInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      setCreated(await createVessel(parsed.data));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível cadastrar a embarcação agora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Embarcação cadastrada"
          description="A embarcação já está disponível na frota."
        />
        <div
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="font-medium">{created.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {created.imoNumber ? `IMO ${created.imoNumber}` : "Sem IMO informado"} ·{" "}
                {created.clientName ?? "Sem cliente vinculado"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/vessels">Voltar para embarcações</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setValues(EMPTY);
              }}
            >
              Cadastrar outra
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova embarcação"
        description="Informe os dados operacionais e o vínculo opcional com um cliente."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Número IMO (opcional)" htmlFor="imoNumber" error={errors.imoNumber}>
            <Input
              id="imoNumber"
              value={values.imoNumber ?? ""}
              onChange={(e) => update("imoNumber", e.target.value)}
              inputMode="numeric"
              maxLength={20}
              placeholder="7 dígitos"
            />
          </Field>
          <Field label="Tipo de embarcação" htmlFor="vesselType" error={errors.vesselType}>
            <Input
              id="vesselType"
              value={values.vesselType ?? ""}
              onChange={(e) => update("vesselType", e.target.value)}
              maxLength={80}
              placeholder="PSV, AHTS, RSV..."
            />
          </Field>
          <Field label="Classe DP" htmlFor="dpClass" error={errors.dpClass}>
            <Input
              id="dpClass"
              value={values.dpClass ?? ""}
              onChange={(e) => update("dpClass", e.target.value)}
              maxLength={20}
              placeholder="DP1, DP2, DP3"
            />
          </Field>
          <Field label="Status" htmlFor="status" error={errors.status}>
            <Select
              value={values.status}
              onValueChange={(value) => update("status", value as VesselFormInput["status"])}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="inactive">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente (opcional)" htmlFor="clientId" error={errors.clientId}>
            <Select
              value={values.clientId ? values.clientId : NO_CLIENT}
              onValueChange={(value) => update("clientId", value === NO_CLIENT ? "" : value)}
              disabled={loadingClients}
            >
              <SelectTrigger id="clientId">
                <SelectValue placeholder={loadingClients ? "Carregando..." : "Sem vínculo"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>Sem vínculo</SelectItem>
                {clients.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link to="/vessels">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Cadastrar embarcação"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
