import { expect, test } from "@playwright/test";

test.describe("superfície pública", () => {
  test("health confirma aplicação e Supabase Auth", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const payload = await response.json();
    expect(payload).toMatchObject({
      status: "ok",
      service: "dp-suite",
      environment: "staging",
      checks: {
        app: { status: "ok" },
        supabase_auth: { status: "ok" },
      },
    });
    expect(payload).not.toHaveProperty("supabase_key");
  });

  test("login e recuperação de senha são acessíveis", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();

    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Recuperar acesso" })).toBeVisible();
  });

  test("aviso de privacidade informa canal e direitos", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Aviso de Privacidade" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seus direitos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "admin@callyvon.com" })).toHaveAttribute(
      "href",
      "mailto:admin@callyvon.com",
    );
  });

  test("rota protegida preserva destino ao redirecionar", async ({ page }) => {
    await page.goto("/privacy-center");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fprivacy-center$/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});
