import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const publicPath = (...parts: string[]) => resolve(process.cwd(), "public", ...parts);

describe("PWA", () => {
  it("declara uma experiência instalável com os ícones obrigatórios", () => {
    const manifest = JSON.parse(readFileSync(publicPath("manifest.webmanifest"), "utf8"));

    expect(manifest).toMatchObject({
      id: "/",
      short_name: "Atino DP Suite",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      lang: "pt-BR",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ]),
    );
  });

  it("mantém navegações e chamadas de dados fora do cache persistente", () => {
    const worker = readFileSync(publicPath("service-worker.js"), "utf8");

    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('["font", "image", "script", "style"]');
    expect(worker).toContain('caches.match("/offline.html")');
  });
});
