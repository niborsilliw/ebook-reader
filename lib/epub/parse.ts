import { toIsbn } from "@/lib/cite/isbn";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { htmlToSegments } from "./html-to-text";
import { applyHeadings, EMPTY_LABEL, isBoilerplate, isHeadingOnly, labelOf, stripGutenberg } from "./labels";

export type TocEntry = { title: string; href: string; level: number };

export type SpineSection = {
  spineIndex: number;
  /**
   * Relative to the OPF directory, as in the manifest, plus "#anchor" when
   * the section starts at a TOC anchor inside the file: what epub.js
   * display() takes.
   */
  href: string;
  chapterTitle: string | null;
  text: string;
};

export type ParsedEpub = {
  title: string | null;
  author: string | null;
  language: string | null;
  /** For citations: dc:publisher, dc:date (the publication date if several), an ISBN identifier. */
  publisher: string | null;
  published: string | null;
  isbn: string | null;
  toc: TocEntry[];
  sections: SpineSection[];
  cover: { data: Uint8Array; mediaType: string; ext: string } | null;
};

export class EpubParseError extends Error {}

type ManifestItem = { id: string; href: string; mediaType: string; properties: string[] };

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  textNodeName: "#text",
  isArray: (name) => ["item", "itemref", "navPoint", "meta", "creator", "title", "language", "rootfile", "publisher", "date", "identifier"].includes(name),
});

export async function parseEpub(input: ArrayBuffer | Uint8Array): Promise<ParsedEpub> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new EpubParseError("Not a valid EPUB (zip) file");
  }

  const container = await readText(zip, "META-INF/container.xml");
  if (!container) throw new EpubParseError("Missing META-INF/container.xml");
  const rootfiles = asArray(xml.parse(container)?.container?.rootfiles?.rootfile);
  const opfPath: string | undefined = (
    rootfiles.find((r) => r["media-type"] === "application/oebps-package+xml") ?? rootfiles[0]
  )?.["full-path"];
  if (!opfPath) throw new EpubParseError("container.xml has no rootfile");

  const opfXml = await readText(zip, opfPath);
  if (!opfXml) throw new EpubParseError(`Missing package document ${opfPath}`);
  const pkg = xml.parse(opfXml)?.package;
  if (!pkg) throw new EpubParseError("Invalid package document");
  const opfDir = dirname(opfPath);

  // Manifest: id -> item, hrefs normalized relative to the OPF directory.
  const manifest = new Map<string, ManifestItem>();
  for (const item of asArray(pkg.manifest?.item)) {
    if (!item?.id || !item?.href) continue;
    manifest.set(item.id, {
      id: item.id,
      href: normalizePath(safeDecode(item.href)),
      mediaType: item["media-type"] ?? "",
      properties: String(item.properties ?? "").split(/\s+/).filter(Boolean),
    });
  }

  const metadata = pkg.metadata ?? {};
  const title = firstText(metadata.title);
  const author = asArray(metadata.creator).map(textOf).filter(Boolean).join(", ") || null;
  const language = firstText(metadata.language);
  const publisher = firstText(metadata.publisher);
  const published = publicationDate(asArray(metadata.date));
  const isbn = findIsbn(asArray(metadata.identifier));

  const spineItems = asArray(pkg.spine?.itemref)
    .map((ref) => manifest.get(ref?.idref))
    .filter((item): item is ManifestItem => Boolean(item));
  if (spineItems.length === 0) throw new EpubParseError("EPUB spine is empty");

  const toc = await readToc(zip, opfDir, manifest, pkg.spine?.toc);
  const cover = await readCover(zip, opfDir, manifest, asArray(metadata.meta));

  // Sections: each spine file is split wherever the TOC points into it
  // (many books keep several chapters in one file). Labels carry over to
  // following files until the TOC says otherwise.
  const tocByFile = new Map<string, TocEntry[]>();
  for (const entry of toc) {
    const file = stripFragment(entry.href);
    tocByFile.set(file, [...(tocByFile.get(file) ?? []), entry]);
  }
  const topLevel = Math.min(...toc.map((e) => e.level), 0);

  const sections: SpineSection[] = [];
  let label = EMPTY_LABEL;
  let pendingHeads: TocEntry[] = [];
  for (const [spineIndex, item] of spineItems.entries()) {
    if (!/html/.test(item.mediaType) && !/\.x?html?$/i.test(item.href)) continue;
    const html = await readText(zip, join(opfDir, item.href));
    if (html == null) continue;

    const entries = tocByFile.get(item.href) ?? [];
    const fragmentOf = (e: TocEntry) => splitFragment(e.href)[1] ?? null;
    const anchors = new Set(entries.map(fragmentOf).filter((f): f is string => Boolean(f)));

    for (const segment of htmlToSegments(html, anchors)) {
      const heads = [...pendingHeads, ...entries.filter((e) => fragmentOf(e) === segment.anchor)];
      const text = stripGutenberg(segment.text);
      // A heading with no text of its own (e.g. "Part II" followed by its
      // subtitle entry) is folded into the next segment's label.
      if (isHeadingOnly(text, heads)) {
        pendingHeads = heads;
        continue;
      }
      pendingHeads = [];
      label = applyHeadings(label, heads, topLevel);
      const chapterTitle = labelOf(label);
      if (isBoilerplate(chapterTitle)) continue;
      sections.push({
        spineIndex,
        href: segment.anchor ? `${item.href}#${segment.anchor}` : item.href,
        chapterTitle,
        text,
      });
    }
  }

  return { title, author, language, publisher, published, isbn, toc, sections, cover };
}

async function readToc(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  ncxId: string | undefined,
): Promise<TocEntry[]> {
  // EPUB 3 navigation document.
  const nav = [...manifest.values()].find((i) => i.properties.includes("nav"));
  if (nav) {
    const html = await readText(zip, join(opfDir, nav.href));
    if (html) {
      const root = parseHtml(html);
      const navEl =
        root.querySelectorAll("nav").find((n) => /\btoc\b/.test(n.getAttribute("epub:type") ?? "")) ??
        root.querySelector("nav");
      const list = navEl?.querySelector("ol");
      if (list) {
        const entries: TocEntry[] = [];
        walkNavList(list, dirname(nav.href), 0, entries);
        if (entries.length) return entries;
      }
    }
  }

  // EPUB 2 NCX.
  const ncx =
    (ncxId && manifest.get(ncxId)) ||
    [...manifest.values()].find((i) => i.mediaType === "application/x-dtbncx+xml");
  if (ncx) {
    const ncxXml = await readText(zip, join(opfDir, ncx.href));
    if (ncxXml) {
      const entries: TocEntry[] = [];
      walkNavPoints(asArray(xml.parse(ncxXml)?.ncx?.navMap?.navPoint), dirname(ncx.href), 0, entries);
      return entries;
    }
  }
  return [];
}

function walkNavList(ol: HTMLElement, baseDir: string, level: number, out: TocEntry[]) {
  for (const li of ol.childNodes) {
    if ((li as HTMLElement).rawTagName?.toLowerCase() !== "li") continue;
    const el = li as HTMLElement;
    const link = el.childNodes.find((c) => ["a", "span"].includes((c as HTMLElement).rawTagName?.toLowerCase()));
    const href = (link as HTMLElement | undefined)?.getAttribute("href");
    const title = (link as HTMLElement | undefined)?.text.replace(/\s+/g, " ").trim();
    if (href && title) out.push({ title, href: resolveHref(baseDir, href), level });
    const sub = el.childNodes.find((c) => (c as HTMLElement).rawTagName?.toLowerCase() === "ol");
    if (sub) walkNavList(sub as HTMLElement, baseDir, level + 1, out);
  }
}

type NavPoint = { navLabel?: { text?: unknown }; content?: { src?: string }; navPoint?: NavPoint[] };

function walkNavPoints(points: NavPoint[], baseDir: string, level: number, out: TocEntry[]) {
  for (const p of points) {
    const title = textOf(p.navLabel?.text)?.replace(/\s+/g, " ").trim();
    const src = p.content?.src;
    if (title && src) out.push({ title, href: resolveHref(baseDir, src), level });
    walkNavPoints(asArray(p.navPoint), baseDir, level + 1, out);
  }
}

async function readCover(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  metas: { name?: string; content?: string }[],
): Promise<ParsedEpub["cover"]> {
  const epub2Id = metas.find((m) => m?.name === "cover")?.content;
  const item =
    [...manifest.values()].find((i) => i.properties.includes("cover-image")) ??
    (epub2Id ? manifest.get(epub2Id) : undefined);
  if (!item || !item.mediaType.startsWith("image/")) return null;
  const file = zip.file(join(opfDir, item.href));
  if (!file) return null;
  const ext = item.mediaType.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "img";
  return { data: await file.async("uint8array"), mediaType: item.mediaType, ext };
}

// ---------------------------------------------------------------------------
// helpers

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(new RegExp(`^${escapeRegExp(path)}$`, "i"))[0];
  return file ? file.async("string") : null;
}

/** Resolve an href found in a document in `baseDir` to a path relative to the OPF dir, keeping any #fragment. */
export function resolveHref(baseDir: string, href: string): string {
  const [path, fragment] = splitFragment(safeDecode(href));
  const resolved = path ? normalizePath(join(baseDir, path)) : "";
  return fragment ? `${resolved}#${fragment}` : resolved;
}

export function stripFragment(href: string) {
  return splitFragment(href)[0];
}

function splitFragment(href: string): [string, string | undefined] {
  const i = href.indexOf("#");
  return i === -1 ? [href, undefined] : [href.slice(0, i), href.slice(i + 1)];
}

function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function join(dir: string, path: string) {
  return normalizePath(dir ? `${dir}/${path}` : path);
}

function normalizePath(path: string) {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// EPUB 2 can give several dates (opf:event="publication" | "creation" |
// "modification"); EPUB 3 gives one dc:date, the publication date.
function publicationDate(dates: unknown[]) {
  const event = (d: unknown) => String((d as { event?: unknown })?.event ?? "").toLowerCase();
  return textOf(dates.find((d) => event(d) === "publication")) ?? textOf(dates.find((d) => !event(d))) ?? null;
}

/** The first identifier that is a valid ISBN (see toIsbn). */
function findIsbn(identifiers: unknown[]): string | null {
  for (const id of identifiers) {
    const isbn = toIsbn(textOf(id));
    if (isbn) return isbn;
  }
  return null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object" && "#text" in (v as object)) return textOf((v as { "#text": unknown })["#text"]);
  return null;
}

function firstText(v: unknown) {
  return textOf(asArray(v as unknown[])[0]);
}
