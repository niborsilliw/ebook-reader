import { describe, expect, it } from "vitest";
import { plainReply } from "@/lib/chat/plain";

describe("plainReply", () => {
  it("drops emphasis marks and passage markers, keeps web addresses", () => {
    expect(plainReply("He *won't* cry [1][3]. See **this** (https://example.com/a).")).toBe(
      "He won't cry. See this (https://example.com/a).",
    );
  });

  it("writes Markdown links out as label and address", () => {
    expect(plainReply("Read [the SEP entry](https://plato.stanford.edu/entries/camus/).")).toBe(
      "Read the SEP entry (https://plato.stanford.edu/entries/camus/).",
    );
  });

  it("leaves arithmetic and list stars alone", () => {
    expect(plainReply("2 * 3 * 4\n* a point")).toBe("2 * 3 * 4\n* a point");
  });
});
