import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  humanReadableStatusError,
  recordProfileLogin,
  requestPasswordReset,
  signInWithPassword,
  signOut,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar · DP Suite" },
      {
        name: "description",
        content: "Acesse o DP Suite com sua conta corporativa.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signIn" | "forgot";

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(email);
        setInfo("Se este e-mail estiver cadastrado, enviaremos instruções em instantes.");
        return;
      }

      await signInWithPassword(email, password);
      const status = await recordProfileLogin();
      if (status !== "active") {
        await signOut();
        setError(humanReadableStatusError(status));
        return;
      }
      await router.navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar.");
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
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {mode === "signIn" ? "Entrar" : "Recuperar acesso"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signIn"
              ? "Use sua conta corporativa."
              : "Enviaremos um link para redefinir sua senha."}
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

          {mode === "signIn" && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

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
            {loading
              ? "Aguarde..."
              : mode === "signIn"
                ? "Entrar"
                : "Enviar link de recuperação"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "signIn" ? (
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setInfo(null);
              }}
            >
              Esqueci minha senha
            </button>
          ) : (
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => {
                setMode("signIn");
                setError(null);
                setInfo(null);
              }}
            >
              Voltar para o login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
