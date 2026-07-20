import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recuperar acesso · DP Suite" },
      { name: "description", content: "Recupere o acesso à sua conta DP Suite." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setInfo("Se este e-mail estiver cadastrado, enviaremos instruções em instantes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground">
            DP Suite
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Recuperar acesso</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviaremos um link para redefinir sua senha.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <p
            className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
            role="status"
          >
            Backend não configurado neste ambiente.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          {info && (
            <p
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
              role="status"
            >
              {info}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !isSupabaseConfigured}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/login" className="underline-offset-4 hover:underline">
            Voltar para o login
          </Link>
        </div>
      </div>
    </main>
  );
}
