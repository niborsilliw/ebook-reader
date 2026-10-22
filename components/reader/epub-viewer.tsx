"use client";

import { useEffect, useRef, useState } from "react";
import ePub, { EpubCFI, type Book, type Location, type Rendition } from "epubjs";
import type { TocEntry } from "@/lib/epub/parse";
import { createClient } from "@/lib/supabase/browser";
import { BOOKS_BUCKET, locationsPath } from "@/lib/storage-paths";
import { IMAGE_PAGE_STYLES, markImagePage } from "@/lib/reader/image-pages";

const SAVE_DEBOUNCE_MS = 2000;
const LOCATION_CHARS = 1600; // granularity of epub.js progress locations
// A swipe is a quick, mostly horizontal drag; anything else (scrolls, taps,
// long-press text selection) is left alone.
const SWIPE_MIN_PX = 50;
const SWIPE_MAX_MS = 800;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  // Set once the reader turns a page or jumps. Until then the location is just
  // where opening the book landed, and must not overwrite the saved position.
  const movedRef = useRef(false);
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
    movedRef.current = false;
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
      const forward = e.key === "ArrowRight" || e.key === "PageDown";
      const back = e.key === "ArrowLeft" || e.key === "PageUp";
      if (!forward && !back) return;
      movedRef.current = true;
      void (forward ? renditionRef.current?.next() : renditionRef.current?.prev());
    };

    // --- swipe to turn pages on touch screens ----------------------------
    // Touches on the page land in the epub.js iframe (forwarded by the
    // rendition); touches on the margins land on the root element.
    let swipeStart: { x: number; y: number; t: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      swipeStart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = swipeStart;
      swipeStart = null;
      const t = e.changedTouches[0];
      if (!start || !t || e.touches.length > 0) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 1.5 * Math.abs(dy) || e.timeStamp - start.t > SWIPE_MAX_MS) return;
      if (e.view?.getSelection()?.isCollapsed === false) return; // dragging a text selection
      movedRef.current = true;
      void (dx < 0 ? renditionRef.current?.next() : renditionRef.current?.prev());
    };
    const root = rootRef.current;
    root?.addEventListener("touchstart", onTouchStart, { passive: true });
    root?.addEventListener("touchend", onTouchEnd);

    // epub.js measures the container once, when the rendition is attached; at
    // 0×0 it can only show the start of a section. Wait until it has a size.
    const waitForLayout = () =>
      new Promise<void>((resolve) => {
        const check = () => (cancelled || (el.clientWidth > 0 && el.clientHeight > 0) ? resolve() : requestAnimationFrame(check));
        check();
      });

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        await waitForLayout();
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
          if (!movedRef.current) return;
          schedule({ cfi: loc.start.cfi, percentage: r?.percentage ?? null, spine_href: safeDecode(loc.start.href) });
        });
        rendition.on("keyup", onKey); // key presses inside the book iframe
        rendition.on("touchstart", onTouchStart);
        rendition.on("touchend", onTouchEnd);

        if (initialCfi) {
          console.log("[reader] restoring saved position", initialCfi, `(container ${el.clientWidth}×${el.clientHeight})`);
          try {
            const cfi = new EpubCFI();
            const landedOn = () => {
              const loc = rendition.currentLocation() as unknown as Location | undefined;
              const ok =
                loc?.start != null && cfi.compare(loc.start.cfi, initialCfi) <= 0 && cfi.compare(initialCfi, loc.end.cfi) <= 0;
              const where = `saved=${initialCfi} landed=${loc?.start?.cfi}…${loc?.end?.cfi} page=${loc?.start?.displayed?.page}/${loc?.start?.displayed?.total}`;
              return { ok, where };
            };
            await rendition.display(initialCfi);
            let landed = landedOn();
            if (!landed.ok) {
              // The first display() scrolls before the theme's styles have
              // re-paginated the chapter, so a position past the unstyled page
              // count is clamped to an earlier page. The layout is final now.
              console.log("[reader] first display missed the saved page; displaying again", landed.where);
              await rendition.display(initialCfi);
              landed = landedOn();
            }
            console[landed.ok ? "log" : "warn"](
              landed.ok ? "[reader] restored position" : "[reader] restore landed on a page that doesn't contain the saved position",
              landed.where,
            );
          } catch (err) {
            console.error("[reader] saved position could not be displayed; opening at the start", initialCfi, err);
            await rendition.display();
          }
        } else {
          console.log("[reader] no saved position; opening at the start");
          await rendition.display();
        }
        if (cancelled) return;
        displayed = true;
        setStatus("ready");
        onReadyRef.current({
          goTo: (target) => {
            movedRef.current = true;
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
      root?.removeEventListener("touchstart", onTouchStart);
      root?.removeEventListener("touchend", onTouchEnd);
      renditionRef.current = null;
      book?.destroy();
    };
  }, [bookId, userId, fileUrl, initialCfi, toc]);

  const turn = (side: "prev" | "next") => {
    movedRef.current = true;
    void renditionRef.current?.[side]();
  };

  return (
    <div ref={rootRef} className="absolute inset-0 flex items-stretch">
      <PageButton side="prev" disabled={status !== "ready" || edges.atStart} onClick={() => turn("prev")} />
      {/* min-w-0: epub.js sizes its container in pixels, which would otherwise
          stop this flex item shrinking to fit a phone screen. */}
      <div className="relative mx-auto h-full w-full max-w-[44rem] min-w-0 py-6 sm:px-8">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
        {status === "loading" && <Overlay>Opening book…</Overlay>}
        {status === "error" && <Overlay>This book couldn’t be opened. Try reloading the page.</Overlay>}
      </div>
      <PageButton side="next" disabled={status !== "ready" || edges.atEnd} onClick={() => turn("next")} />
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
      className="group flex w-7 shrink-0 items-center justify-center text-[#8c8478] transition-colors hover:text-[#1f1d1a] disabled:pointer-events-none disabled:opacity-0 sm:w-20"
    >
      {/* An SVG rather than a ‹ › glyph: the glyph rendered at ~8px and was
          too faint to find on tablets. */}
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 sm:size-7" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d={side === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
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
