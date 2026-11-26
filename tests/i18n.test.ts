import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { langFrom } = await import("@/lib/i18n/server");
const { strings } = await import("@/lib/i18n/strings");
const { isQuickQuestion } = await import("@/lib/chat/passage");
const { systemPrompt } = await import("@/lib/rag/prompt");

describe("the reader's language", () => {
  it("follows the browser's first language Nancy speaks", () => {
    expect(langFrom("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(langFrom("ca-ES,ca;q=0.9,es;q=0.8")).toBe("ca");
    expect(langFrom("fr-FR,es;q=0.8")).toBe("es");
    expect(langFrom("fr-FR,en-GB;q=0.9")).toBe("en");
    expect(langFrom(null)).toBe("en");
  });

  it("has every word in Castellano and Catalan too", () => {
    const keys = Object.keys(strings("en")).sort();
    expect(Object.keys(strings("es")).sort()).toEqual(keys);
    expect(Object.keys(strings("ca")).sort()).toEqual(keys);
    expect(strings("es").page(12)).toBe("Página 12");
    expect(strings("ca").page(12)).toBe("Pàgina 12");
  });

  it("asks Nancy to answer in the reader's language", () => {
    expect(systemPrompt("La Regenta")).toMatch(/language the reader writes in/);
  });

  it("knows a quick question in Spanish", () => {
    expect(isQuickQuestion("¿Qué significa «féretro»?")).toBe(true);
    expect(isQuickQuestion("qué quiere decir esto")).toBe(true);
    expect(isQuickQuestion("¿Qué es un féretro?")).toBe(true);
    expect(isQuickQuestion("Què vol dir «taüt»?")).toBe(true);
    expect(isQuickQuestion("Què és un taüt?")).toBe(true);
    expect(isQuickQuestion("¿Por qué Meursault no llora en el entierro de su madre?")).toBe(false);
  });
});
