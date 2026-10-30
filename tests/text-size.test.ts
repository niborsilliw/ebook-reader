// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./helpers/storage";
import { loadTextSize, nextTextSize, saveTextSize, textScale } from "@/lib/reader/text-size";

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("text size", () => {
  it("cycles Small → Default → Large → Small at 0.9×, 1× and 1.1×", () => {
    expect(nextTextSize("small")).toBe("default");
    expect(nextTextSize("default")).toBe("large");
    expect(nextTextSize("large")).toBe("small");
    expect(["small", "default", "large"].map((s) => textScale(s as "small"))).toEqual([0.9, 1, 1.1]);
  });

  it("is remembered in this browser, and falls back to Default", () => {
    expect(loadTextSize()).toBe("default");
    saveTextSize("large");
    expect(loadTextSize()).toBe("large");
    localStorage.setItem("reader:text-size", "huge");
    expect(loadTextSize()).toBe("default");
  });

  it("carries on when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => saveTextSize("small")).not.toThrow();
    expect(loadTextSize()).toBe("default");
  });
});
