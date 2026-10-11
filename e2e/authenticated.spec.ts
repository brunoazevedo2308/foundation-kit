import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const member = credentials("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD");
const admin = credentials("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");

async function login(page: Page, email: string, password: string) {
  const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
  const supabasePublishableKey = requiredEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Falha ao autenticar a conta E2E: ${error?.message ?? "sessão ausente"}`);
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await page.addInitScript(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      storageKey: `sb-${projectRef}-auth-token`,
      session: data.session,
    },
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /^Olá,/ })).toBeVisible();
}

test.describe("member", () => {
  test.skip(!member, "Configure E2E_MEMBER_EMAIL e E2E_MEMBER_PASSWORD.");

  test("autentica, lê dados permitidos e respeita o gate administrativo", async ({ page }) => {
    await login(page, member!.email, member!.password);

    await page.goto("/actions");
    await expect(page.getByRole("heading", { name: "Ações" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nova ação" })).toHaveCount(0);

    await page.goto("/users");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/privacy-center");
    await expect(page.getByRole("heading", { name: "Central de Privacidade" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Minhas solicitações" })).toBeVisible();
  });
});

test.describe("admin", () => {
  test.skip(!admin, "Configure E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD.");

  test("autentica e acessa as áreas administrativas do próprio tenant", async ({ page }) => {
    await login(page, admin!.email, admin!.password);

    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Convidar usuário" })).toBeVisible();

    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo cliente" })).toBeVisible();

    await page.goto("/privacy-center");
    await expect(page.getByRole("heading", { name: "Solicitações da organização" })).toBeVisible();
  });
});

function credentials(emailName: string, passwordName: string) {
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName];
  return email && password ? { email, password } : null;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}
