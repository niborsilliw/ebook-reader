"use client";

import { useEffect, useRef, useState } from "react";
import { useStrings } from "@/lib/i18n/client";
import ePub, { EpubCFI, type Book, type Contents, type Location, type Rendition } from "epubjs";
import type { TocEntry } from "@/lib/epub/parse";
import type { Highlight } from "@/lib/notes/types";
import { colorFill } from "@/lib/notes/colors";
import * as db from "@/lib/data/actions";
import { IMAGE_PAGE_STYLES, markImagePage } from "@/lib/reader/image-pages";
import { BODY_FONT, installBodyFont } from "@/lib/reader/fonts";
import { hideScrollbars } from "@/lib/reader/scrollbars";
import { lockDownChapter } from "@/lib/reader/content-security";
import { toIsbn } from "@/lib/cite/isbn";
import { msSinceTouch, noteTouchEnd } from "@/lib/reader/last-touch";
import { TAP_UNITS, rangeAtPoint, selectRange } from "@/lib/reader/tap-select";

const SAVE_DEBOUNCE_MS = 2000;
const LOCATION_CHARS = 1600; // granularity of epub.js progress locations
// A swipe is a quick, mostly horizontal drag; anything else (scrolls, taps,
// long-press text selection) is left alone.
const SWIPE_MIN_PX = 50;
const SWIPE_MAX_MS = 800;
// A tap: a touch that ends close to where it started, quickly.
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 500;
// A swipe that starts this close to a screen edge and moves inwards summons
// that side's drawer instead of turning the page.
const EDGE_SWIPE_PX = 24;
// Taps (and clicks) on the text select it: once the word, twice the
// sentence, three times the paragraph. The selection's colour bar only
// appears once no further tap can follow.
const MULTI_TAP_MS = 350;
const MULTI_CLICK_MS = 450;
const MULTI_TAP_SLOP_PX = 24;
// A mouse event this soon after a touch is the browser's emulation of it.
const TOUCH_MOUSE_MS = 800;
const RESIZE_SETTLE_MS = 150;
// After a text size change, how long the chapter takes to settle at the new size.
const RETYPE_SETTLE_MS = 400;
// From tablet width up (Tailwind's sm, where the page margins widen) the text
// is set smaller, like a printed paperback: Libre Baskerville's tall x-height
// makes the 16px body most books ask for read as large print. Phones keep the
// book's own size.
const WIDE_QUERY = "(min-width: 640px)";
const WIDE_FONT_SIZE = 13.5; // px
// From here up the book opens as a two-page spread, like a physical book.
// Each page's text is a little under half the container (epub.js puts a
// gutter between and around the pages), so below this the pages would be
// cramped: about 46 characters a line here, 51 at 1120px, 58 at 1280px. Set
// low enough to catch every iPad in landscape (the smaller ones are 1080px
// wide). It must match the column's min-[1000px] width class below.
const SPREAD_QUERY = "(min-width: 1000px)";
// A page turn slides the new page in from the side it came from: short and
// shallow, so the eye can follow the change without a 3D flip.
const PAGE_SLIDE_MS = 180;
const PAGE_SLIDE_PX = 60;
const PAGE_SLIDE_OPACITY = 0.35;
// If a turn goes nowhere (the end of the book), stop waiting for it.
const PAGE_SLIDE_GIVE_UP_MS = 1500;
// How often an open reader checks whether another device has moved on.
const SYNC_POLL_MS = 10_000;

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
  /** Start of the page being read, its chapter, and the text on it. */
  currentLocation: () => { cfi: string; chapter: string | null; excerpt: string } | null;
  /** The EPUB's own publication metadata, for citing books indexed before it was stored. */
  publication: () => Publication;
};

export type Publication = { publisher: string | null; published: string | null; isbn: string | null };

/** Where the reader is, reported on every page turn. */
export type ReaderLocation = {
  chapter: string | null;
  /** Stable page number (one per epub.js location), the same on every screen size; null until locations load. */
  page: number | null;
  percentage: number | null;
  href: string;
  /** First and last visible positions on the screen. */
  start: string;
  end: string;
};

type Props = {
  bookId: string;
  fileUrl: string;
  initialCfi: string | null;
  initialPositionAt: string | null;
  toc: TocEntry[];
  highlights: Highlight[];
  onSelection: (selection: BookSelection | null) => void;
  onHighlightClick: (id: string) => void;
  onLocation: (loc: ReaderLocation) => void;
  onReady: (api: ReaderApi) => void;
  /** Drawn over the top corner of the page (the bookmark ribbon). */
  pageMarker?: React.ReactNode;
  /** A touch swipe in from a screen edge. */
  onEdgeSwipe?: (side: "left" | "right") => void;
  /** A tap on the page that isn't on a highlight. */
  onTap?: () => void;
  /** Key presses inside the book's iframe, which never reach the page's window. */
  onFrameKeyDown?: (e: KeyboardEvent) => void;
  /** The reader's text size, as a multiple of the normal size. */
  textScale?: number;
};

type Position = db.Position;
type Resizable = { resize(width: number, height: number, cfi?: string): void };
// The parts of epub.js's (untyped) view manager that move between pages.
type PageMover = {
  scrollBy(x: number, y: number, silent?: boolean): void;
  scrollTo(x: number, y: number, silent?: boolean): void;
  clear(): void;
};

export function EpubViewer({
  bookId,
  fileUrl,
  initialCfi,
  initialPositionAt,
  toc,
  highlights,
  onSelection,
  onHighlightClick,
  onLocation,
  onReady,
  pageMarker,
  onEdgeSwipe,
  onTap,
  onFrameKeyDown,
  textScale = 1,
}: Props) {
  const t = useStrings();
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  // Set when the reader turns a page or jumps, and consumed by the next
  // "relocated". Other relocations (opening the book, re-paginating after a
  // resize) don't move the reading position, so they aren't saved.
  const userMoveRef = useRef(false);
  // Turns a page; set once the book is open (used by the page buttons).
  const turnRef = useRef<(side: "prev" | "next") => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  // Latest callbacks without re-running the effect.
  const onLocationRef = useRef(onLocation);
  const onReadyRef = useRef(onReady);
  const onSelectionRef = useRef(onSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;
  // A touch that began on a highlight, and the highlight last opened (a tap
  // and the click that may follow it open it once).
  const highlightTouchRef = useRef<{ id: string; at: number } | null>(null);
  const lastOpenedRef = useRef<{ id: string; at: number } | null>(null);
  const openHighlightRef = useRef((id: string) => {
    const now = performance.now();
    const last = lastOpenedRef.current;
    if (last?.id === id && now - last.at < 1000) return;
    lastOpenedRef.current = { id, at: now };
    onHighlightClickRef.current(id);
  });
  onLocationRef.current = onLocation;
  onReadyRef.current = onReady;
  onSelectionRef.current = onSelection;
  const onEdgeSwipeRef = useRef(onEdgeSwipe);
  onEdgeSwipeRef.current = onEdgeSwipe;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onFrameKeyDownRef = useRef(onFrameKeyDown);
  onFrameKeyDownRef.current = onFrameKeyDown;
  const textScaleRef = useRef(textScale);
  // Re-sets the text at the current size, once the book is open.
  const retypeRef = useRef<() => void>(() => {});

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
    // Whether the rendition is showing two-page spreads (see applySpread).
    let spreadOn: boolean | null = null;

    // --- debounced position saving -------------------------------------
    let pending: Position | null = null;
    let lastSavedCfi = initialCfi;
    // updated_at of the newest saved position this device has written or
    // followed. A newer one in the database was saved by another device.
    let knownAt = initialPositionAt;
    let saving = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(timer);
      const pos = pending;
      pending = null;
      if (!pos || pos.cfi === lastSavedCfi) return;
      lastSavedCfi = pos.cfi;
      saving = true;
      void db.savePosition(bookId, pos).then(({ data, error }) => {
          saving = false;
          if (error) {
            console.error("save position failed", error.message);
            lastSavedCfi = null; // retry on the next move
          } else if (data) {
            knownAt = data.updated_at; // our own save: don't follow it
          }
        });
    };
    const schedule = (pos: Position) => {
      pending = pos;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };
    // Set once the book is open: checks for a newer position from another device.
    let pull: () => Promise<void> = async () => {};
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    // Save on the way out; check for moves made elsewhere on the way back.
    const onHide = () => (document.visibilityState === "hidden" ? flush() : void pull());
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
      // Locations are fixed-size runs of text, so they number pages the way a
      // printed book does: the same on a phone as on a desktop.
      // (epub.js's types say this returns a Location; it returns an index.)
      const page = hasLocations ? (book.locations.locationFromCfi(loc.start.cfi) as unknown as number) + 1 : null;
      onLocationRef.current({
        chapter: chapterFor(loc.start.index),
        page,
        percentage,
        href: safeDecode(loc.start.href),
        start: loc.start.cfi,
        end: loc.end.cfi,
      });
      return { percentage };
    };

    // --- page turns: margins, keys and swipes ------------------------------
    // Every turn goes through turnPage, and the new page slides in from the
    // side it comes from. The slide must start in the same task that puts the
    // new page on screen, or the page is painted at rest first and then jumps
    // (Safari fires scroll events only after painting). So it is started from
    // epub.js's own page moves, hooked once the book is open (hookPageMoves):
    // a scroll within a chapter, or, moving into another chapter, the clear
    // of the old one, which holds the page in the slide's start pose until
    // the new chapter is shown ("relocated").
    let slideFrom: -1 | 0 | 1 = 0;
    let slideAnim: Animation | null = null;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const startPose = (dir: number) => ({ transform: `translateX(${dir * PAGE_SLIDE_PX}px)`, opacity: `${PAGE_SLIDE_OPACITY}` });
    const unpose = () => Object.assign(el.style, { transform: "", opacity: "" });
    const slide = () => {
      const dir = slideFrom;
      slideFrom = 0;
      clearTimeout(giveUp);
      if (!dir) return;
      unpose(); // the animation starts from the same pose
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      slideAnim?.cancel(); // a quick second turn starts its own slide
      slideAnim = el.animate([startPose(dir), { transform: "none", opacity: "1" }], {
        duration: PAGE_SLIDE_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    };
    const hookPageMoves = (manager: PageMover) => {
      const after = <K extends keyof PageMover>(name: K, fn: () => void) => {
        const original = manager[name].bind(manager) as (...args: unknown[]) => unknown;
        manager[name] = ((...args: unknown[]) => {
          const result = original(...args);
          fn();
          return result;
        }) as PageMover[K];
      };
      after("scrollBy", slide);
      after("scrollTo", slide);
      after("clear", () => {
        if (slideFrom && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) Object.assign(el.style, startPose(slideFrom));
      });
    };
    const turnPage = (side: "prev" | "next") => {
      const r = renditionRef.current;
      if (!r) return;
      userMoveRef.current = true;
      slideFrom = side === "next" ? 1 : -1; // the next page comes in from the right
      clearTimeout(giveUp);
      giveUp = setTimeout(() => {
        slideFrom = 0;
        unpose();
      }, PAGE_SLIDE_GIVE_UP_MS);
      void r[side]();
    };
    turnRef.current = turnPage;

    const onKey = (e: KeyboardEvent) => {
      const forward = e.key === "ArrowRight" || e.key === "PageDown";
      const back = e.key === "ArrowLeft" || e.key === "PageUp";
      if (forward || back) turnPage(forward ? "next" : "prev");
    };

    // --- selections ------------------------------------------------------
    // Reports the selection in `contents` to the page, which shows its colour bar.
    const showSelection = (contents: Contents) => {
      const selection = contents.window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || selection.rangeCount === 0 || !text) return onSelectionRef.current(null);
      const range = selection.getRangeAt(0);
      const cfiRange = contents.cfiFromRange(range);
      // Range rects are relative to the iframe; shift them into the page.
      const r = range.getBoundingClientRect();
      const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
      const dx = frame?.left ?? 0;
      const dy = frame?.top ?? 0;
      const index = (renditionRef.current?.currentLocation() as unknown as Location | undefined)?.start?.index ?? 0;
      onSelectionRef.current({
        cfiRange,
        text,
        chapter: chapterFor(book?.spine.get(cfiRange)?.index ?? index),
        rect: { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy },
        clear: () => contents.window.getSelection()?.removeAllRanges(),
      });
    };
    // While a selection is still being made (the mouse button is down, or
    // another tap may follow), epub.js's own "selected" events are ignored,
    // so the colour bar only appears for the finished selection.
    let unsettled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (contents: Contents, after: number) => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        unsettled = false;
        taps = null;
        showSelection(contents);
      }, after);
    };
    const unsettle = () => {
      clearTimeout(settleTimer);
      unsettled = true;
    };
    const release = () => {
      clearTimeout(settleTimer);
      unsettled = false;
      taps = null;
    };
    // Selects the word (count 1), sentence (2) or paragraph (3) at a point in
    // the chapter; false if the point isn't on text.
    const selectAt = (contents: Contents, x: number, y: number, count: number) => {
      const range = rangeAtPoint(contents.document, x, y, TAP_UNITS[Math.min(count, 3) - 1], book?.packaging?.metadata?.language);
      if (!range) return false;
      unsettle();
      selectRange(contents.document, range);
      return true;
    };
    const tappedLink = (e: Event) => !!(e.target as Element | null)?.closest?.("a[href]");

    // A run of taps on the same spot: each one widens the selection.
    let taps: { doc: Document; x: number; y: number; at: number; count: number } | null = null;
    // A tap in the chapter at (x, y); true if it selected (or dismissed) text.
    const tapText = (contents: Contents, x: number, y: number) => {
      const doc = contents.document;
      const now = performance.now();
      const run = taps;
      if (run && run.doc === doc && now - run.at < MULTI_TAP_MS && Math.hypot(x - run.x, y - run.y) < MULTI_TAP_SLOP_PX && run.count < 3) {
        run.count++;
        run.at = now;
        if (selectAt(contents, run.x, run.y, run.count)) settle(contents, run.count === 3 ? 0 : MULTI_TAP_MS);
        return true;
      }
      // With a selection showing, a tap only puts it away.
      if (doc.getSelection()?.isCollapsed === false) {
        release();
        doc.getSelection()?.removeAllRanges();
        return true;
      }
      if (!selectAt(contents, x, y, 1)) return false;
      taps = { doc, x, y, at: now, count: 1 };
      settle(contents, MULTI_TAP_MS);
      return true;
    };

    // Clicks select the same way. The browser counts the clicks (e.detail);
    // its own double- and triple-click selections are replaced by these.
    // Dragging selects as usual, and shows the colour bar on release.
    const watchMouse = (contents: Contents) => {
      const doc = contents.document;
      let press: { x: number; y: number; hadSelection: boolean } | null = null;
      doc.addEventListener("mousedown", (e) => {
        press = null;
        if (e.button !== 0 || msSinceTouch() < TOUCH_MOUSE_MS) return;
        if (e.detail >= 2) e.preventDefault();
        press = { x: e.clientX, y: e.clientY, hadSelection: e.detail === 1 && doc.getSelection()?.isCollapsed === false };
        unsettle();
      });
      doc.addEventListener("mouseup", (e) => {
        if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_SLOP_PX) return;
        press = null; // the end of a drag
        release();
        showSelection(contents);
      });
      doc.addEventListener("click", (e) => {
        const p = press;
        press = null;
        if (!p) return;
        if (tappedLink(e) || (e.detail === 1 && p.hadSelection)) return release(); // following a link, or putting a selection away
        const opened = lastOpenedRef.current;
        // Let a click on a highlight open it first (epub.js handles the same click).
        setTimeout(() => {
          if (lastOpenedRef.current !== opened) return release();
          if (selectAt(contents, e.clientX, e.clientY, e.detail)) settle(contents, e.detail >= 3 ? 0 : MULTI_CLICK_MS);
          else release();
        });
      });
    };

    // --- swipe to turn pages on touch screens ----------------------------
    // Touches on the page land in the epub.js iframe (forwarded by the
    // rendition); touches on the margins land on the root element.
    let swipeStart: { x: number; y: number; t: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      swipeStart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
    };
    // Touches in the chapter come with its contents (see the content hook).
    const onTouchEnd = (e: TouchEvent, contents?: Contents) => {
      noteTouchEnd();
      const start = swipeStart;
      swipeStart = null;
      const t = e.changedTouches[0];
      const onHighlight = highlightTouchRef.current;
      highlightTouchRef.current = null;
      if (!start || !t || e.touches.length > 0) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // A tap on a highlight opens it. iOS Safari often sends no click for a
      // tap on plain text, so the tap is recognised here rather than relying
      // on the click epub.js would forward.
      const tapped = Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX && e.timeStamp - start.t < TAP_MAX_MS;
      if (tapped && onHighlight && performance.now() - onHighlight.at < TAP_MAX_MS) return openHighlightRef.current(onHighlight.id);
      // A tap on the text selects it; cancelling the tap's default keeps the
      // browser from undoing that, or zooming on a double tap.
      if (tapped && contents && !tappedLink(e) && tapText(contents, t.clientX, t.clientY)) return e.preventDefault();
      const selecting = e.view?.getSelection()?.isCollapsed === false;
      if (tapped) return void (!selecting && onTapRef.current?.());
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 1.5 * Math.abs(dy) || e.timeStamp - start.t > SWIPE_MAX_MS) return;
      if (selecting) return; // dragging a text selection
      // Edges are outside the book's iframe, so these touches are the page's
      // own (in its coordinates), not ones forwarded from the iframe.
      if (e.view === window && start.x < EDGE_SWIPE_PX && dx > 0) return onEdgeSwipeRef.current?.("left");
      if (e.view === window && start.x > window.innerWidth - EDGE_SWIPE_PX && dx < 0) return onEdgeSwipeRef.current?.("right");
      turnPage(dx < 0 ? "next" : "prev");
    };
    const root = rootRef.current;
    root?.addEventListener("touchstart", onTouchStart, { passive: true });
    const onRootTouchEnd = (e: TouchEvent) => onTouchEnd(e);
    root?.addEventListener("touchend", onRootTouchEnd);

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
        // Book content is untrusted. Every chapter gets a policy forbidding
        // all script before it is rendered (see content-security.ts), which is
        // what lets the iframe allow scripts: Safari won't run the reader's
        // own listeners (swipes, selection, keys) in a script-less iframe.
        book.spine.hooks.content.register(lockDownChapter);
        const rendition = book.renderTo(el, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          // Single page or spread, decided by SPREAD_QUERY (applySpread).
          spread: window.matchMedia(SPREAD_QUERY).matches ? "auto" : "none",
          minSpreadWidth: 1, // whenever spread is "auto" (0 would mean epub.js's default, 800px)
          allowScriptedContent: true,
        });
        renditionRef.current = rendition;
        drawnRef.current.clear();

        applyTypeScale(rendition);
        spreadOn = window.matchMedia(SPREAD_QUERY).matches;
        rendition.themes.default({
          // Keep book content inside the page column on narrow screens.
          // Never overflow: hidden here: it clips epub.js's columns and every
          // page after the first comes up blank. Scrollbars are hidden
          // visually instead (hideScrollbars).
          "html, body": { "max-width": "100%", "box-sizing": "border-box" },
          // No double-tap zoom: a double tap selects the sentence.
          html: { "touch-action": "manipulation" },
          body: {
            "font-family": `${BODY_FONT} !important`,
            "font-size": "1.08rem",
            "line-height": "1.55",
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
          // Titles are never justified (a short wrapped title would be stretched).
          "h1, h2, h3": { "text-align": "center" },
          ...IMAGE_PAGE_STYLES,
        });
        // Covers and other single-picture pages: centred at 60% width instead of full-bleed.
        rendition.hooks.content.register((contents: Contents) => {
          markImagePage(contents.document);
          hideScrollbars(contents.document); // visually only: overflow stays, or pagination breaks
          declareLanguage(contents.document, book?.packaging?.metadata?.language);
          // Hide the selection actions once the selection is gone (tap elsewhere).
          contents.document.addEventListener("selectionchange", () => {
            if (contents.document.getSelection()?.isCollapsed !== false) onSelectionRef.current(null);
          });
          // Not passive (as epub.js's own forwarding is), so a tap can be cancelled.
          contents.document.addEventListener("touchend", (e) => onTouchEnd(e, contents));
          watchMouse(contents);
          // epub.js waits for this before laying out the chapter's pages.
          return installBodyFont(contents.document);
        });

        // Selections made any other way (a long press on a touch screen, then
        // its handles), once they have stopped changing.
        rendition.on("selected", (_cfiRange: string, contents: Contents) => !unsettled && showSelection(contents));

        rendition.on("relocated", (loc: Location) => {
          slide(); // a turn into another chapter (or nothing, if a scroll already slid)
          setEdges({ atStart: loc.atStart, atEnd: loc.atEnd });
          release();
          onSelectionRef.current(null);
          const r = report(loc);
          if (!userMoveRef.current) return;
          userMoveRef.current = false;
          anchor = loc.start.cfi;
          schedule({ cfi: loc.start.cfi, percentage: r?.percentage ?? null, spine_href: safeDecode(loc.start.href) });
        });
        rendition.on("keyup", onKey); // key presses inside the book iframe
        rendition.on("keydown", (e: KeyboardEvent) => onFrameKeyDownRef.current?.(e));
        rendition.on("touchstart", onTouchStart);

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
            await rendition.display(target);
            landed = landedOn();
          }
          return landed;
        };

        if (initialCfi) {
          try {
            const landed = await displayAt(initialCfi);
            if (landed.ok) anchor = initialCfi;
            else console.warn("[reader] restore landed on a page that doesn't contain the saved position", landed.where);
          } catch (err) {
            console.error("[reader] saved position could not be displayed; opening at the start", initialCfi, err);
            await rendition.display();
          }
        } else {
          await rendition.display();
        }
        if (cancelled) return;
        displayed = true;
        setStatus("ready");
        // epub.js creates its view manager on the first display.
        const manager = (rendition as unknown as { manager: PageMover }).manager;
        hookPageMoves(manager);

        // A new text size: set it, then lay the chapter out again from the
        // start of the page being read, so the reader stays on their words.
        retypeRef.current = () => {
          if (cancelled) return;
          // Read before the new size reflows the page under it.
          const here = (rendition.currentLocation() as unknown as Location | undefined)?.start?.cfi ?? anchor;
          if (!applyTypeScale(rendition)) return;
          manager.clear();
          const redisplay = async () => {
            if (!here) return void (await rendition.display());
            await displayAt(here);
            // The chapter is still settling at the new size when display()
            // returns, and the page under the reader can slip back a few as
            // it does; once it has settled, show the reader's place again.
            await new Promise((resolve) => setTimeout(resolve, RETYPE_SETTLE_MS));
            if (!cancelled) await displayAt(here);
          };
          void redisplay().catch((err) => console.error("[reader] couldn't re-lay out at the new text size", err));
        };

        // --- follow moves made on other devices --------------------------
        // Polls the saved position and jumps to it when another device saved
        // a newer one. A local move waiting to be saved wins: it is newer, and
        // will overwrite the other device's position when it saves.
        let pulling = false;
        pull = async () => {
          if (cancelled || pulling || saving || pending || document.visibilityState === "hidden") return;
          pulling = true;
          try {
            const { data, error } = await db.getPosition(bookId);
            if (error) return console.error("[reader] position sync failed", error.message);
            // Re-check: the reader may have turned a page while this was out.
            if (!data || cancelled || saving || pending || !isNewer(data.updated_at, knownAt)) return;
            knownAt = data.updated_at;
            lastSavedCfi = data.cfi;
            if (data.cfi === anchor) return;
            // Not a user move, so the "relocated" this causes isn't saved back.
            slideFrom = 0;
            unpose();
            const landed = await displayAt(data.cfi);
            if (landed.ok) anchor = data.cfi;
            else console.warn("[reader] synced position landed on the wrong page", landed.where);
          } catch (err) {
            console.error("[reader] position sync failed", err);
          } finally {
            pulling = false;
          }
        };
        pollTimer = setInterval(() => void pull(), SYNC_POLL_MS);

        onReadyRef.current({
          goTo: (target) => {
            userMoveRef.current = true;
            slideFrom = 0; // jumps don't slide
            unpose();
            if (target.startsWith("epubcfi(")) {
              void displayAt(target).catch((err) => console.error("[reader] couldn't jump to", target, err));
            } else {
              void rendition.display(target).catch(() => rendition.display(target.split("#")[0]));
            }
          },
          currentLocation: () => {
            const loc = rendition.currentLocation() as unknown as Location | undefined;
            if (!loc?.start) return null;
            return { cfi: loc.start.cfi, chapter: chapterFor(loc.start.index), excerpt: pageText(rendition, loc) };
          },
          publication: () => {
            const meta = (book as unknown as { packaging?: { metadata?: Record<string, string | undefined> } }).packaging?.metadata;
            return { publisher: meta?.publisher || null, published: meta?.pubdate || null, isbn: toIsbn(meta?.identifier) };
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
      const cached = await db.loadLocations(bookId);
      if (cached) {
        try {
          b.locations.load(cached);
          return;
        } catch {
          // fall through and regenerate
        }
      }
      await b.locations.generate(LOCATION_CHARS);
      if (cancelled) return;
      await db.saveLocations(bookId, b.locations.save());
    }

    const onWindowKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      onKey(e);
    };
    window.addEventListener("keyup", onWindowKey);

    // Sets (or clears) the body size for the screen width and the reader's
    // text size. An !important inline style, as the book's own stylesheet
    // often sizes the body itself. epub.js applies it to each chapter before
    // laying it out. Says whether anything changed.
    let typeSet: string | null = null;
    function applyTypeScale(r: Rendition) {
      const wide = window.matchMedia(WIDE_QUERY).matches;
      const scale = textScaleRef.current;
      const key = `${wide}:${scale}`;
      if (key === typeSet) return false;
      typeSet = key;
      if (wide) r.themes.override("font-size", `${+(WIDE_FONT_SIZE * scale).toFixed(2)}px`, true);
      // On a phone the book's own size usually wins over the theme's, and is
      // usually the reader's default: scale that.
      else if (scale !== 1) r.themes.override("font-size", `${Math.round(scale * 100)}%`, true);
      // removeOverride exists in epub.js but is missing from its types.
      else (r.themes as unknown as { removeOverride(name: string): void }).removeOverride("font-size");
      return true;
    }

    // Two pages or one. Switched by the same breakpoint as the column's width
    // (not by epub.js's own container-width test), so a wide single page with
    // overlong lines never appears.
    function applySpread(r: Rendition) {
      const on = window.matchMedia(SPREAD_QUERY).matches;
      if (on === spreadOn) return;
      spreadOn = on;
      r.spread(on ? "auto" : "none", 1);
    }

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
        if (!r || !displayed) return;
        // Crossing the tablet or spread breakpoint changes the column's width
        // too, so a type size or spread change always arrives here and is
        // laid out with the resize.
        applyTypeScale(r);
        applySpread(r);
        (r as unknown as Resizable).resize(el.clientWidth, el.clientHeight, anchor ?? undefined);
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      flush();
      clearTimeout(giveUp);
      clearTimeout(settleTimer);
      clearInterval(pollTimer);
      observer.disconnect();
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keyup", onWindowKey);
      root?.removeEventListener("touchstart", onTouchStart);
      root?.removeEventListener("touchend", onRootTouchEnd);
      renditionRef.current = null;
      book?.destroy();
    };
  }, [bookId, fileUrl, initialCfi, initialPositionAt, toc]);

  useEffect(() => {
    if (textScaleRef.current === textScale) return;
    textScaleRef.current = textScale;
    retypeRef.current();
  }, [textScale]);

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
      // epub.js calls this on touchstart as well as click. A click opens the
      // highlight; a touch only marks it, and the touch's end decides whether
      // it was a tap (open it) or a swipe (turn the page) — see onTouchEnd.
      const onClick = (e: Event) => {
        if (e.type === "click") openHighlightRef.current(id);
        else if (e.type === "touchstart") highlightTouchRef.current = { id, at: performance.now() };
      };
      // One class only: epub.js adds it with classList.add().
      rendition.annotations.highlight(h.cfi_range, { id }, onClick, `reader-highlight-${h.color}`, {
        fill: colorFill(h.color),
        "fill-opacity": "0.7", // multiplied over the page (see globals.css), so the text stays dark
      });
      drawn.set(id, h.cfi_range);
    }
  }, [highlights, status]);

  const turn = (side: "prev" | "next") => turnRef.current(side);

  return (
    <div ref={rootRef} className="absolute inset-0 flex items-stretch overflow-hidden">
      <PageButton side="prev" disabled={status !== "ready" || edges.atStart} onClick={() => turn("prev")} />
      {/* min-w-0: epub.js sizes its container in pixels, which would otherwise
          stop this flex item shrinking to fit a phone screen. The width and
          margins give a measure of 65–70 characters of Libre Baskerville (at
          WIDE_FONT_SIZE) per line on a desktop or tablet, set in generous
          white space. From SPREAD_QUERY up it holds a two-page spread of about
          46–58 characters a page, growing on bigger screens (about 60, then
          65) so the book fills more of the screen without overlong lines. */}
      {/* No overflow-hidden here: on phones the bookmark ribbon hangs out of
          this column into the margin. The epub.js container inside and the
          root around it keep the book from ever scrolling. */}
      <div className="relative h-full w-full max-w-[38rem] min-w-0 py-8 sm:px-12 sm:py-12 min-[1000px]:max-w-[68rem] min-[1400px]:max-w-[72rem] min-[1700px]:max-w-[76rem]">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
        {status === "ready" && pageMarker}
        {status === "loading" && <Overlay>{t.openingBook}</Overlay>}
        {status === "error" && <Overlay>{t.bookFailed}</Overlay>}
      </div>
      <PageButton side="next" disabled={status !== "ready" || edges.atEnd} onClick={() => turn("next")} />
    </div>
  );
}

// The margins either side of the text turn the page when clicked or tapped.
// They show nothing, so the page stays calm; they grow to fill all the white
// space beside the text, so a click anywhere in it turns the page.
function PageButton({ side, disabled, onClick }: { side: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const t = useStrings();
  return (
    <button
      type="button"
      aria-label={side === "prev" ? t.prevPage : t.nextPage}
      disabled={disabled}
      onClick={onClick}
      className="min-w-7 flex-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#8c8478] disabled:pointer-events-none sm:min-w-20"
    />
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#fbf9f4] text-sm text-[#6b655c]">
      {children}
    </div>
  );
}

// Browsers only hyphenate text whose language they know, and many EPUBs
// declare it in their metadata but not on each chapter. Without it, justified
// lines on a phone open wide gaps between words.
function declareLanguage(doc: Document, language: string | undefined) {
  const root = doc.documentElement;
  if (root.lang || root.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang")) return;
  const tag = language?.trim();
  if (!tag || !/^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i.test(tag)) return;
  root.lang = tag;
}

// The text visible on the screen, whitespace collapsed ("" for a picture page).
function pageText(rendition: Rendition, loc: Location) {
  try {
    const contents = (rendition.getContents() as unknown as Contents[])[0];
    if (!contents) return "";
    const from = contents.range(loc.start.cfi);
    const to = contents.range(loc.end.cfi);
    const range = contents.document.createRange();
    range.setStart(from.startContainer, from.startOffset);
    range.setEnd(to.endContainer, to.endOffset);
    return range.toString().replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// Postgres timestamps carry microseconds; trim to milliseconds so every
// browser parses them.
function isNewer(at: string, than: string | null) {
  const ms = (t: string) => Date.parse(t.replace(/(\.\d{3})\d+/, "$1"));
  return than == null || ms(at) > ms(than);
}

function safeDecode(href: string) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}
