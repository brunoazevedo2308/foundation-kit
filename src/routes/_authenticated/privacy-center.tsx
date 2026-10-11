import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  createPrivacyRequest,
  listPrivacyRequests,
  PrivacyRequestSchema,
  privacyRequestStatusLabel,
  privacyRequestTypeLabel,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  updatePrivacyRequest,
  type PrivacyRequest,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from "@/lib/privacy-requests";

export const Route = createFileRoute("/_authenticated/privacy-center")({
  head: () => ({
    meta: [
      { title: "Central de Privacidade · DP Suite" },
      { name: "description", content: "Solicitações de direitos sobre dados pessoais." },
    ],
  }),
  component: PrivacyCenterPage,
});

function PrivacyCenterPage() {
  const { profile } = Route.useRouteContext();
  const isAdmin = profile.role !== "member";
  const [items, setItems] = useState<PrivacyRequest[]>([]);
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listPrivacyRequests()
      .then((rows) => active && setItems(rows))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = PrivacyRequestSchema.safeParse({ requestType, details });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os dados da solicitação.");
      return;
    }
    setSaving(true);
    try {
      const created = await createPrivacyRequest(parsed.data);
      setItems((current) => [created, ...current]);
      setDetails("");
      setMessage("Solicitação registrada. Você pode acompanhar o andamento abaixo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(
    item: PrivacyRequest,
    status: PrivacyRequestStatus,
    responseSummary: string,
  ) {
    setError(null);
    try {
      const updated = await updatePrivacyRequest(item.id, status, responseSummary);
      setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setMessage("Solicitação atualizada.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Central de Privacidade"
        description="Registre e acompanhe solicitações relacionadas aos seus dados pessoais."
        actions={
          <Button asChild variant="outline">
            <Link to="/privacy">Ler aviso de privacidade</Link>
          </Button>
        }
      />

      <form onSubmit={submitRequest} className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <h2 className="font-semibold">Nova solicitação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O pedido será analisado com verificação de identidade, escopo e obrigações de retenção.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="requestType">Direito solicitado</Label>
          <Select
            value={requestType}
            onValueChange={(value) => setRequestType(value as PrivacyRequestType)}
          >
            <SelectTrigger id="requestType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REQUEST_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {privacyRequestTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="details">Descrição</Label>
          <Textarea
            id="details"
            value={details}
            maxLength={4000}
            rows={4}
            placeholder="Explique quais dados ou tratamentos estão envolvidos. Não informe senhas."
            onChange={(event) => setDetails(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{details.length}/4.000 caracteres</p>
        </div>
        {message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Registrando..." : "Registrar solicitação"}
        </Button>
      </form>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">
            {isAdmin ? "Solicitações da organização" : "Minhas solicitações"}
          </h2>
          {isAdmin ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Administradores visualizam e tratam somente pedidos da própria organização.
            </p>
          ) : null}
        </div>
        {loading ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            Carregando solicitações...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="mx-auto mb-2 h-7 w-7" />
            Nenhuma solicitação registrada.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <RequestCard key={item.id} item={item} canManage={isAdmin} onUpdate={updateItem} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestCard({
  item,
  canManage,
  onUpdate,
}: {
  item: PrivacyRequest;
  canManage: boolean;
  onUpdate: (item: PrivacyRequest, status: PrivacyRequestStatus, response: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(item.status);
  const [response, setResponse] = useState(item.responseSummary ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <li className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{privacyRequestTypeLabel(item.requestType)}</p>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {privacyRequestStatusLabel(item.status)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.details}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Registrada em {new Date(item.createdAt).toLocaleString("pt-BR")}
      </p>
      {item.responseSummary && !canManage ? (
        <p className="mt-3 rounded-md bg-muted p-3 text-sm">
          <strong>Resposta:</strong> {item.responseSummary}
        </p>
      ) : null}
      {canManage ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor={`status-${item.id}`}>Andamento</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as PrivacyRequestStatus)}
            >
              <SelectTrigger id={`status-${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {privacyRequestStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`response-${item.id}`}>Resposta ao titular</Label>
            <Textarea
              id={`response-${item.id}`}
              value={response}
              maxLength={4000}
              rows={3}
              onChange={(event) => setResponse(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onUpdate(item, status, response);
              setSaving(false);
            }}
          >
            {saving ? "Salvando..." : "Salvar andamento"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
