// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CHAPTER_CSP, lockDownChapter } from "@/lib/reader/content-security";

const xhtml = (head: string, body: string) =>
  new DOMParser().parseFromString(
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head>${head}</head><body>${body}</body></html>`,
    "application/xhtml+xml",
  );

describe("lockDownChapter", () => {
  it("puts the script-forbidding policy first in <head>, ahead of any script", () => {
    const d = xhtml(`<title>One</title><script>alert(1)</script>`, `<p>Text</p>`);
    lockDownChapter(d);
    const first = d.querySelector("head")!.firstElementChild!;
    expect(first.localName).toBe("meta");
    expect(first.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(first.getAttribute("content")).toBe(CHAPTER_CSP);
    expect(CHAPTER_CSP).toContain("script-src 'none'");
  });

  it("removes scripts, plugins, handlers, script URLs, srcdoc frames and refreshes", () => {
    const d = xhtml(
      `<meta http-equiv="refresh" content="0;url=javascript:alert(1)"/>`,
      `<script>alert(1)</script>
       <img src="x.png" onerror="alert(2)" alt=""/>
       <a href="javascript:alert(3)">link</a>
       <a href=" JavaScript:alert(4)">spaced</a>
       <svg xmlns="http://www.w3.org/2000/svg" onload="alert(5)"><a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(6)"><text>t</text></a></svg>
       <iframe srcdoc="&lt;script&gt;alert(7)&lt;/script&gt;"></iframe>
       <object data="evil.swf"></object><embed src="evil.swf"/>
       <form action="javascript:alert(8)"><button formaction="javascript:alert(9)">b</button></form>
       <a href="chapter2.xhtml#n1" onclick="alert(10)">a real link</a>`,
    );
    lockDownChapter(d);
    const html = new XMLSerializer().serializeToString(d);
    expect(html).not.toMatch(/<script|<object|<embed|refresh|javascript:|srcdoc|onerror|onload|onclick/i);
    // Ordinary content and links survive.
    expect(d.querySelector('a[href="chapter2.xhtml#n1"]')?.textContent).toBe("a real link");
    expect(d.querySelector("img")?.getAttribute("src")).toBe("x.png");
  });

  it("adds a <head> to a chapter that has none", () => {
    const d = new DOMParser().parseFromString(`<html xmlns="http://www.w3.org/1999/xhtml"><body><p>x</p></body></html>`, "application/xhtml+xml");
    lockDownChapter(d);
    expect(d.documentElement.firstElementChild?.localName).toBe("head");
    expect(d.querySelector("meta")?.getAttribute("content")).toBe(CHAPTER_CSP);
  });
});
