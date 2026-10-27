import { describe, expect, it } from "vitest";
import { splitEmphasis } from "@/lib/chat/emphasis";

describe("splitEmphasis", () => {
  it("turns *asterisks* and _underscores_ into italics, without the marks", () => {
    expect(splitEmphasis("Arendt admired *The Rebel* (*L’Homme révolté*) and _meant_ it.")).toEqual([
      { text: "Arendt admired " },
      { text: "The Rebel", em: true },
      { text: " (" },
      { text: "L’Homme révolté", em: true },
      { text: ") and " },
      { text: "meant", em: true },
      { text: " it." },
    ]);
  });

  it("turns **double asterisks** into bold", () => {
    expect(splitEmphasis("not **once** but *twice*")).toEqual([
      { text: "not " },
      { text: "once", strong: true },
      { text: " but " },
      { text: "twice", em: true },
    ]);
  });

  it("leaves marks that aren't emphasis alone", () => {
    for (const text of ["2 * 3 * 4", "* a list item", "snake_case_name", "an * unclosed mark", "a lone *", "**"]) {
      expect(splitEmphasis(text)).toEqual([{ text }]);
    }
  });

  it("doesn't reach across lines", () => {
    expect(splitEmphasis("*one\ntwo*")).toEqual([{ text: "*one\ntwo*" }]);
  });
});
