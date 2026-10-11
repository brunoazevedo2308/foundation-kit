import { expect, type Page, test } from "@playwright/test";

const member = credentials("E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD");
const admin = credentials("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
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
