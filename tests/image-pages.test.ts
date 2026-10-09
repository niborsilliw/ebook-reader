// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { IMAGE_PAGE_CLASS, IMAGE_PAGE_FIGURE_CLASS, IMAGE_PAGE_STYLES, markImagePage } from "@/lib/reader/image-pages";

const doc = (body: string) => new DOMParser().parseFromString(`<html><body>${body}</body></html>`, "text/html");

describe("markImagePage", () => {
  it("marks Project Gutenberg's full-page SVG cover (the Ethics wrap0000.xhtml markup)", () => {
    const d = doc(`<div class="x-ebookmaker-cover">
      <svg xmlns="http://www.w3.org/2000/svg" height="100%" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1600 2400" width="100%">
        <image width="1600" height="2400" href="cover.png"/>
      </svg></div>`);
    const figure = markImagePage(d);
    expect(figure?.tagName.toLowerCase()).toBe("svg");
    expect(figure?.classList.contains(IMAGE_PAGE_FIGURE_CLASS)).toBe(true);
    expect(d.body.classList.contains(IMAGE_PAGE_CLASS)).toBe(true);
  });

  it("marks a single <img> page, allowing a short caption", () => {
    const d = doc(`<p><img src="cover.jpg" alt="Cover"/></p><p>Frontispiece</p>`);
    expect(markImagePage(d)?.tagName.toLowerCase()).toBe("img");
  });

  it("leaves images inside ordinary text pages alone", () => {
    const d = doc(`<h1>Chapter 1</h1><p>${"It was a bright cold day in April. ".repeat(5)}</p><img src="map.png"/>`);
    expect(markImagePage(d)).toBeNull();
    expect(d.querySelector("img")!.classList.contains(IMAGE_PAGE_FIGURE_CLASS)).toBe(false);
  });

  it("leaves pages with several images, or only a decorative svg, alone", () => {
    expect(markImagePage(doc(`<img src="a.png"/><img src="b.png"/>`))).toBeNull();
    expect(markImagePage(doc(`<svg viewBox="0 0 10 10"><circle r="5"/></svg>`))).toBeNull();
    expect(markImagePage(doc(``))).toBeNull();
  });

  it("styles the figure at 60% width, centred, aspect ratio kept, never taller than the page", () => {
    const rule = IMAGE_PAGE_STYLES[`.${IMAGE_PAGE_FIGURE_CLASS}`];
    expect(rule).toMatchObject({
      width: "60% !important",
      "max-width": "60% !important",
      height: "auto !important",
      margin: "5vh auto 0 !important",
    });
    expect(rule["max-height"]).toMatch(/vh/);
  });
});
