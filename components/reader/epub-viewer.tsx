"use client";

import { useEffect, useRef, useState } from "react";
import ePub, { EpubCFI, type Book, type Location, type Rendition } from "epubjs";
import type { TocEntry } from "@/lib/epub/parse";
import type { Highlight } from "@/lib/notes/types";
import { colorFill } from "@/lib/notes/colors";
import { createClient } from "@/lib/supabase/browser";
import { BOOKS_BUCKET, locationsPath } from "@/lib/storage-paths";
import { IMAGE_PAGE_STYLES, markImagePage } from "@/lib/reader/image-pages";

const SAVE_DEBOUNCE_MS = 2000;
const LOCATION_CHARS = 1600; // granularity of epub.js progress locations
// A swipe is a quick, mostly horizontal drag; anything else (scrolls, taps,
// long-press text selection) is left alone.
const SWIPE_MIN_PX = 50;
const SWIPE_MAX_MS = 800;
const RESIZE_SETTLE_MS = 150;

/** A text selection in the book, positioned in the page's (not the iframe's) viewport. */
export type BookSelection = {
  cfiRange: string;
  text: string;
  chapter: string | null;
  rect: { left: number; right: number; top: number; bottom: number };
  clear: () => void;
};

export type ReaderApi = {
  /** Navigate to a spine href (as stored on chunks/TOC, fragment allowed) or a CFI / CFI range. */
  goTo: (target: string) => void;
  /** Start of the page being read, and its chapter. */
  currentLocation: () => { cfi: string; chapter: string | null } | null;
};

type Props = {
  bookId: string;
  userId: string;
  fileUrl: string;
  initialCfi: string | null;
  toc: TocEntry[];
  highlights: Highlight[];
  onSelection: (selection: BookSelection | null) => void;
  onHighlightClick: (id: string) => void;
  onLocation: (loc: { chapter: string | null; percentage: number | null; href: string }) => void;
  onReady: (api: ReaderApi) => void;
};

type Position = { cfi: string; percentage: number | null; spine_href: string };
type Resizable = { resize(width: number, height: number, cfi?: string): void };

const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`;

export function EpubViewer({ bookId, userId, fileUrl, initialCfi, toc, highlights, onSelection, onHighlightClick, onLocation, onReady }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  // Set when the reader turns a page or jumps, and consumed by the next
  // "relocated". Other relocations (opening the book, re-paginating after a
  // resize) don't move the reading position, so they aren't saved.
  const userMoveRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  // Latest callbacks without re-running the effect.
  const onLocationRef = useRef(onLocation);
  const onReadyRef = useRef(onReady);
  const onSelectionRef = useRef(onSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;
  onLocationRef.current = onLocation;
  onReadyRef.current = onReady;
  onSelectionRef.current = onSelection;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let book: Book | null = null;
    let displayed = false;
    userMoveRef.current = false;
    // Where the reader is: the restored position, then wherever they last moved
    // to. Resizes re-display here; epub.js would otherwise re-display at the
    // start of the visible page, drifting back a little on every resize.
    let anchor: string | null = null;
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
      userMoveRef.current = true;
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
      userMoveRef.current = true;
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
        drawnRef.current.clear();

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
          // Hide the selection actions once the selection is gone (tap elsewhere).
          contents.document.addEventListener("selectionchange", () => {
            if (contents.document.getSelection()?.isCollapsed !== false) onSelectionRef.current(null);
          });
        });

        rendition.on("selected", (cfiRange: string, contents: { window: Window; sectionIndex?: number }) => {
          const selection = contents.window.getSelection();
          const text = selection?.toString().trim() ?? "";
          if (!selection || selection.rangeCount === 0 || !text) return onSelectionRef.current(null);
          // Range rects are relative to the iframe; shift them into the page.
          const r = selection.getRangeAt(0).getBoundingClientRect();
          const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
          const dx = frame?.left ?? 0;
          const dy = frame?.top ?? 0;
          const index = (rendition.currentLocation() as unknown as Location | undefined)?.start?.index ?? 0;
          onSelectionRef.current({
            cfiRange,
            text,
            chapter: chapterFor(book?.spine.get(cfiRange)?.index ?? index),
            rect: { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy },
            clear: () => contents.window.getSelection()?.removeAllRanges(),
          });
        });

        rendition.on("relocated", (loc: Location) => {
          setEdges({ atStart: loc.atStart, atEnd: loc.atEnd });
          onSelectionRef.current(null);
          const r = report(loc);
          if (!userMoveRef.current) return;
          userMoveRef.current = false;
          anchor = loc.start.cfi;
          schedule({ cfi: loc.start.cfi, percentage: r?.percentage ?? null, spine_href: safeDecode(loc.start.href) });
        });
        rendition.on("keyup", onKey); // key presses inside the book iframe
        rendition.on("touchstart", onTouchStart);
        rendition.on("touchend", onTouchEnd);

        // Displays a CFI (point or range) and checks the page shown contains it.
        // The first display() of a section scrolls before the theme's styles
        // have re-paginated it, so a position past the unstyled page count is
        // clamped to an earlier page; by the second display the layout is final.
        const displayAt = async (target: string) => {
          const point = new EpubCFI(target);
          point.collapse(true);
          const landedOn = () => {
            const loc = rendition.currentLocation() as unknown as Location | undefined;
            const ok = loc?.start != null && point.compare(loc.start.cfi, point) <= 0 && point.compare(point, loc.end.cfi) <= 0;
            const where = `saved=${target} landed=${loc?.start?.cfi}…${loc?.end?.cfi} page=${loc?.start?.displayed?.page}/${loc?.start?.displayed?.total}`;
            return { ok, where };
          };
          await rendition.display(target);
          let landed = landedOn();
          if (!landed.ok) {
            console.log("[reader] first display missed the target page; displaying again", landed.where);
            await rendition.display(target);
            landed = landedOn();
          }
          return landed;
        };

        if (initialCfi) {
          console.log("[reader] restoring saved position", initialCfi, `(container ${el.clientWidth}×${el.clientHeight})`);
          try {
            const landed = await displayAt(initialCfi);
            if (landed.ok) anchor = initialCfi;
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
            userMoveRef.current = true;
            if (target.startsWith("epubcfi(")) {
              void displayAt(target).catch((err) => console.error("[reader] couldn't jump to", target, err));
            } else {
              void rendition.display(target).catch(() => rendition.display(target.split("#")[0]));
            }
          },
          currentLocation: () => {
            const loc = rendition.currentLocation() as unknown as Location | undefined;
            return loc?.start ? { cfi: loc.start.cfi, chapter: chapterFor(loc.start.index) } : null;
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

    // Re-lay out pages when the container changes size (window resize or a
    // panel opening/closing). Re-paginating is expensive, so wait until the
    // size settles rather than doing it on every frame of a panel animation.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const r = renditionRef.current;
        // epub.js throws if asked to resize before its first page is laid out.
        // resize()'s optional CFI to re-display at is missing from epub.js's types.
        if (r && displayed) (r as unknown as Resizable).resize(el.clientWidth, el.clientHeight, anchor ?? undefined);
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      flush();
      observer.disconnect();
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keyup", onWindowKey);
      root?.removeEventListener("touchstart", onTouchStart);
      root?.removeEventListener("touchend", onTouchEnd);
      renditionRef.current = null;
      book?.destroy();
    };
  }, [bookId, userId, fileUrl, initialCfi, toc]);

  // Draw highlights. epub.js keeps annotations and re-applies them whenever a
  // section is rendered, so each one only needs adding once per rendition.
  const drawnRef = useRef(new Map<string, string>()); // highlight id -> cfi range
  useEffect(() => {
    const rendition = renditionRef.current;
    if (status !== "ready" || !rendition) return;
    const drawn = drawnRef.current;
    const wanted = new Map(highlights.map((h) => [h.id, h]));
    for (const [id, cfi] of drawn) {
      if (!wanted.has(id)) {
        rendition.annotations.remove(cfi, "highlight");
        drawn.delete(id);
      }
    }
    for (const [id, h] of wanted) {
      if (drawn.has(id)) continue;
      // epub.js calls this on touchstart as well as click; only a click (or a
      // tap, which ends in one) means "open this highlight", not a swipe.
      const onClick = (e: Event) => e.type === "click" && onHighlightClickRef.current(id);
      // One class only: epub.js adds it with classList.add().
      rendition.annotations.highlight(h.cfi_range, { id }, onClick, `reader-highlight-${h.color}`, {
        fill: colorFill(h.color),
        "fill-opacity": "0.45",
        "mix-blend-mode": "multiply",
      });
      drawn.set(id, h.cfi_range);
    }
  }, [highlights, status]);

  const turn = (side: "prev" | "next") => {
    userMoveRef.current = true;
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
