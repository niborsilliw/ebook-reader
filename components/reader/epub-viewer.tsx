"use client";

import { useEffect, useRef, useState } from "react";
import ePub, { type Book, type Location, type Rendition } from "epubjs";
import type { TocEntry } from "@/lib/epub/parse";
import { createClient } from "@/lib/supabase/browser";
import { BOOKS_BUCKET, locationsPath } from "@/lib/storage-paths";
import { IMAGE_PAGE_STYLES, markImagePage } from "@/lib/reader/image-pages";

const SAVE_DEBOUNCE_MS = 2000;
const LOCATION_CHARS = 1600; // granularity of epub.js progress locations

export type ReaderApi = {
  /** Navigate to a spine href (as stored on chunks/TOC, fragment allowed) or a CFI. */
  goTo: (target: string) => void;
};

type Props = {
  bookId: string;
  userId: string;
  fileUrl: string;
  initialCfi: string | null;
  toc: TocEntry[];
  onLocation: (loc: { chapter: string | null; percentage: number | null; href: string }) => void;
  onReady: (api: ReaderApi) => void;
};

type Position = { cfi: string; percentage: number | null; spine_href: string };

const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`;

export function EpubViewer({ bookId, userId, fileUrl, initialCfi, toc, onLocation, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  // Latest callbacks without re-running the effect.
  const onLocationRef = useRef(onLocation);
  const onReadyRef = useRef(onReady);
  onLocationRef.current = onLocation;
  onReadyRef.current = onReady;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let book: Book | null = null;
    let displayed = false;
    const supabase = createClient();

    // --- debounced position saving -------------------------------------
    let pending: Position | null = null;
    let lastSavedCfi = initialCfi;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(timer);
      const pos = pending;
      pending = null;
      if (!pos || pos.cfi === lastSavedCfi) return;
      lastSavedCfi = pos.cfi;
      void supabase
        .from("reading_positions")
        .upsert({ book_id: bookId, ...pos }, { onConflict: "user_id,book_id" })
        .then(({ error }) => {
          if (error) {
            console.error("save position failed", error.message);
            lastSavedCfi = null; // retry on the next move
          }
        });
    };
    const schedule = (pos: Position) => {
      pending = pos;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    // --- chapter titles: nearest TOC entry at or before the current spine item
    const titleByFile = new Map<string, string>();
    for (const entry of toc) {
      const file = entry.href.split("#")[0];
      if (!titleByFile.has(file)) titleByFile.set(file, entry.title);
    }
    const chapterFor = (spineIndex: number) => {
      if (!book) return null;
      for (let i = spineIndex; i >= 0; i--) {
        const section = book.spine.get(i);
        const title = section && titleByFile.get(safeDecode(section.href));
        if (title) return title;
      }
      return null;
    };

    const report = (loc: Location) => {
      if (!book) return;
      const hasLocations = book.locations.length() > 0;
      const percentage = hasLocations ? book.locations.percentageFromCfi(loc.start.cfi) : null;
      onLocationRef.current({ chapter: chapterFor(loc.start.index), percentage, href: safeDecode(loc.start.href) });
      return { percentage };
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") void renditionRef.current?.next();
      if (e.key === "ArrowLeft" || e.key === "PageUp") void renditionRef.current?.prev();
    };

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;

        book = ePub(data);
        const rendition = book.renderTo(el, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
          allowScriptedContent: false, // book content is untrusted
        });
        renditionRef.current = rendition;

        rendition.themes.default({
          // Keep book content inside the page column on narrow screens.
          "html, body": { "max-width": "100%", "box-sizing": "border-box" },
          body: {
            "font-family": `${SERIF} !important`,
            "font-size": "1.08rem",
            "line-height": "1.65",
            color: "#1f1d1a",
            background: "transparent",
            "text-rendering": "optimizeLegibility",
            "font-kerning": "normal",
            hyphens: "auto",
            "-webkit-hyphens": "auto",
            "hyphenate-limit-chars": "6 3 3",
            // Safari's spelling of the 3/3 before/after limits.
            "-webkit-hyphenate-limit-before": "3",
            "-webkit-hyphenate-limit-after": "3",
            "overflow-wrap": "break-word",
          },
          "p, li, blockquote, dd": { "font-family": "inherit !important", "line-height": "inherit" },
          a: { color: "inherit" },
          "img, svg, video, table": { "max-width": "100%" },
          pre: { "white-space": "pre-wrap" },
          ...IMAGE_PAGE_STYLES,
        });
        // Covers and other single-picture pages: centred at 60% width instead of full-bleed.
        rendition.hooks.content.register((contents: { document: Document }) => {
          markImagePage(contents.document);
        });

        rendition.on("relocated", (loc: Location) => {
          setEdges({ atStart: loc.atStart, atEnd: loc.atEnd });
          const r = report(loc);
          schedule({ cfi: loc.start.cfi, percentage: r?.percentage ?? null, spine_href: safeDecode(loc.start.href) });
        });
        rendition.on("keyup", onKey); // key presses inside the book iframe

        try {
          await rendition.display(initialCfi ?? undefined);
        } catch {
          await rendition.display(); // saved CFI no longer valid
        }
        if (cancelled) return;
        displayed = true;
        setStatus("ready");
        onReadyRef.current({
          goTo: (target) => {
            void rendition.display(target).catch(() => rendition.display(target.split("#")[0]));
          },
        });

        await loadLocations(book);
        const current = rendition.currentLocation() as unknown as Location | undefined;
        if (!cancelled && current?.start) report(current);
      } catch (err) {
        console.error("open book failed", err);
        if (!cancelled) setStatus("error");
      }
    })();

    // Progress locations are expensive to compute for long books: cache them
    // next to the EPUB after the first open.
    async function loadLocations(b: Book) {
      const path = locationsPath(userId, bookId);
      const storage = supabase.storage.from(BOOKS_BUCKET);
      const { data: cached } = await storage.download(path);
      if (cached) {
        try {
          b.locations.load(await cached.text());
          return;
        } catch {
          // fall through and regenerate
        }
      }
      await b.locations.generate(LOCATION_CHARS);
      if (cancelled) return;
      await storage.upload(path, new Blob([b.locations.save()], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    }

    const onWindowKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      onKey(e);
    };
    window.addEventListener("keyup", onWindowKey);

    // Re-lay out pages when the container changes size (window resize or the
    // assistant panel opening/closing).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = renditionRef.current;
        // epub.js throws if asked to resize before its first page is laid out.
        if (r && displayed) r.resize(el.clientWidth, el.clientHeight);
      });
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      flush();
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keyup", onWindowKey);
      renditionRef.current = null;
      book?.destroy();
    };
  }, [bookId, userId, fileUrl, initialCfi, toc]);

  return (
    <div className="absolute inset-0 flex items-stretch">
      <PageButton side="prev" disabled={status !== "ready" || edges.atStart} onClick={() => renditionRef.current?.prev()} />
      {/* min-w-0: epub.js sizes its container in pixels, which would otherwise
          stop this flex item shrinking to fit a phone screen. */}
      <div className="relative mx-auto h-full w-full max-w-[44rem] min-w-0 py-6 sm:px-8">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
        {status === "loading" && <Overlay>Opening book…</Overlay>}
        {status === "error" && <Overlay>This book couldn’t be opened. Try reloading the page.</Overlay>}
      </div>
      <PageButton side="next" disabled={status !== "ready" || edges.atEnd} onClick={() => renditionRef.current?.next()} />
    </div>
  );
}

function PageButton({ side, disabled, onClick }: { side: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === "prev" ? "Previous page" : "Next page"}
      disabled={disabled}
      onClick={onClick}
      className="group flex w-7 shrink-0 items-center justify-center text-2xl text-[#b3ab9d] transition-colors hover:text-[#1f1d1a] disabled:pointer-events-none disabled:opacity-0 sm:w-20"
    >
      <span aria-hidden className="font-serif">
        {side === "prev" ? "‹" : "›"}
      </span>
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#fbf9f4] text-sm text-[#6b655c]">
      {children}
    </div>
  );
}

function safeDecode(href: string) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}
