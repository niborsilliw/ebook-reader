import { describe, expect, it } from "vitest";
import { splitLinks } from "@/lib/chat/links";

const link = (href: string, label: string) => ({ href, label });

describe("splitLinks", () => {
  it("finds a bare address in parentheses, as the prompt asks, labelled by its site", () => {
    expect(splitLinks("evil (https://www.pbs.org/wnet/arendt/36129/).")).toEqual([
      "evil (",
      link("https://www.pbs.org/wnet/arendt/36129/", "pbs.org"),
      ").",
    ]);
  });

  it("joins a run of cited addresses into one parenthesis", () => {
    expect(splitLinks("so (https://a.example/x)(https://b.example/y).")).toEqual([
      "so (",
      link("https://a.example/x", "a.example"),
      ", ",
      link("https://b.example/y", "b.example"),
      ").",
    ]);
  });

  it("leaves sentence punctuation outside the address", () => {
    expect(splitLinks("See https://a.example/x. Then https://b.example, and more")).toEqual([
      "See ",
      link("https://a.example/x", "a.example"),
      ". Then ",
      link("https://b.example", "b.example"),
      ", and more",
    ]);
  });

  it("keeps balanced parentheses that belong to the address", () => {
    expect(splitLinks("(https://en.wikipedia.org/wiki/The_Stranger_(Camus_novel))")).toEqual([
      "(",
      link("https://en.wikipedia.org/wiki/The_Stranger_(Camus_novel)", "en.wikipedia.org"),
      ")",
    ]);
  });

  it("finds Markdown links, angle-bracketed addresses and addresses without a scheme", () => {
    expect(splitLinks("[the SEP entry](https://plato.stanford.edu/entries/arendt/), <https://doi.org/10.1093/x:y.3> or www.pbs.org/arendt.")).toEqual([
      link("https://plato.stanford.edu/entries/arendt/", "the SEP entry"),
      ", ",
      link("https://doi.org/10.1093/x:y.3", "doi.org"),
      " or ",
      link("https://www.pbs.org/arendt", "pbs.org"),
      ".",
    ]);
  });

  it("leaves text without addresses, and the book's [n] markers, alone", () => {
    expect(splitLinks("As she says [2], http:// is not an address.")).toEqual(["As she says [2], http:// is not an address."]);
    expect(splitLinks("")).toEqual([]);
  });
});
