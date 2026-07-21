import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  humanReadableStatusError,
  recordProfileLogin,
  signInWithPassword,
  signOut,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { DEFAULT_RETURN_PATH, sanitizeReturnPath } from "@/lib/return-path";

/**
 * Login route (TT-005 + TT-006).
 *
 * Accepts an optional `?redirect=<same-origin path>` search param preserved
 * by the `_authenticated` gate. Any unsafe value is dropped by
 * `sanitizeReturnPath` and the user lands on `/dashboard` instead.
 */

const SearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search) => SearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Entrar · DP Suite" },
      { name: "description", content: "Acesse o DP Suite com sua conta corporativa." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/login" });
  const returnTo = sanitizeReturnPath(search.redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithPassword(email, password);
      const status = await recordProfileLogin();
      if (status !== "active") {
        await signOut();
        setError(humanReadableStatusError(status));
        return;
      }
      await router.navigate({ to: returnTo || DEFAULT_RETURN_PATH });
    } catch (err) {
      // Errors from auth.ts are already generic PT strings; fall back defensively.
      setError(err instanceof Error ? err.message : "E-mail ou senha inválidos.");
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
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use sua conta corporativa.</p>
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

          {error && (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !isSupabaseConfigured}>
            {loading ? "Aguarde..." : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/forgot-password" className="underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </main>
  );
}
