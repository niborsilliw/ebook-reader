"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TocEntry } from "@/lib/epub/parse";
import { Button } from "@/components/ui/button";
import { Drawer } from "./drawer";
import { CloseIcon, DialogueIcon, NibIcon } from "./icons";
import { SummonControls } from "./summon-controls";
import { TocList } from "./toc-list";
import type { BookSelection, Publication, ReaderApi, ReaderLocation } from "./epub-viewer";
import { SelectionBar } from "./selection-bar";
import { BookmarkRibbon } from "./bookmark-ribbon";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { createClient } from "@/lib/supabase/browser";
import { BOOKMARK_COLUMNS, HIGHLIGHT_COLUMNS, type Bookmark, type Highlight } from "@/lib/notes/types";
import type { HighlightColor } from "@/lib/notes/colors";
import { compareCfi } from "@/lib/notes/order";
import { bookBibtex } from "@/lib/cite/bibtex";
import { copyBib } from "@/lib/cite/copy";
import { loadTextSize, nextTextSize, saveTextSize, textScale, textSizeLabel, type TextSize } from "@/lib/reader/text-size";

// epub.js touches `window` at import time.
const EpubViewer = dynamic(() => import("./epub-viewer").then((m) => m.EpubViewer), {
  ssr: false,
  loading: () => <ReaderMessage>Opening book…</ReaderMessage>,
});

type Props = {
  bookId: string;
  userId: string;
  title: string;
  author: string | null;
  /** Stored at ingest, for citations; null for books indexed before that. */
  publication: Publication;
  fileUrl: string;
  initialCfi: string | null;
  /** updated_at of the saved position, to tell when another device has moved on. */
  initialPositionAt: string | null;
  toc: TocEntry[];
  ready: boolean;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
};

const BOOKMARK_LABEL_CHARS = 80;

// The right drawer's tabs.
const RIGHT_TABS = [
  { id: "notes", label: "Notes", Icon: NibIcon },
  { id: "assistant", label: "Assistant", Icon: DialogueIcon },
] as const;
type RightTab = (typeof RIGHT_TABS)[number]["id"];

// The "Aa" button is drawn at a size that hints at the text size it sets.
const TEXT_SIZE_GLYPH: Record<TextSize, string> = { small: "text-[0.8rem]", default: "text-[0.95rem]", large: "text-[1.1rem]" };

export function ReaderShell({
  bookId,
  userId,
  title,
  author,
  publication,
  fileUrl,
  initialCfi,
  initialPositionAt,
  toc,
  ready,
  initialHighlights,
  initialBookmarks,
}: Props) {
  // Navigation is summoned, not resident: Contents & Library from the left,
  // Notes & Assistant from the right, one at a time, over the page.
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("notes");
  const [revealControls, setRevealControls] = useState(0);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [selection, setSelection] = useState<BookSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null); // open item in the notes panel
  const [focusNote, setFocusNote] = useState(0);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  // The last text selected or highlight tapped: the assistant takes it as
  // what the reader's next question is about, until it is sent, dismissed,
  // or the reader turns the page.
  const [askAbout, setAskAbout] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>("default");
  const api = useRef<ReaderApi | null>(null);
  const currentHref = useRef<string | null>(null);
  const pageStart = useRef<string | null>(null);
  const drawerOpen = useRef(false);
  drawerOpen.current = drawer !== null;

  const onLocation = useCallback((loc: ReaderLocation) => {
    setLocation(loc);
    currentHref.current = loc.href;
    // Turning the page moves on from the passage; jumps made from the
    // drawer (a citation, a note) don't.
    if (pageStart.current && loc.start !== pageStart.current && !drawerOpen.current) setAskAbout(null);
    pageStart.current = loc.start;
  }, []);

  const onSelection = useCallback((sel: BookSelection | null) => {
    setSelection(sel);
    if (sel) setAskAbout(sel.text);
  }, []);

  // A bookmark marks the page it falls on, wherever the page breaks are on
  // this screen. It is saved at the page's start; epub.js sometimes reports
  // a page's end as before its start, so a match there counts on its own.
  const pageBookmark = location
    ? bookmarks.find(
        (b) =>
          b.cfi === location.start || (compareCfi(location.start, b.cfi) <= 0 && compareCfi(b.cfi, location.end) <= 0),
      )
    : undefined;

  const done = (sel: BookSelection) => {
    sel.clear();
    setSelection(null);
  };

  const openDrawer = (side: "left" | "right", tab?: RightTab) => {
    if (selection) done(selection); // the colour bar would float over the drawer
    if (tab) setRightTab(tab);
    setDrawer(side);
  };
  const closeDrawer = () => setDrawer(null);

  async function saveHighlight(sel: BookSelection, color: HighlightColor) {
    setSaving(true);
    const { data, error } = await createClient()
      .from("highlights")
      .insert({ book_id: bookId, cfi_range: sel.cfiRange, text: sel.text, chapter_title: sel.chapter, color })
      .select(HIGHLIGHT_COLUMNS)
      .single();
    setSaving(false);
    if (error || !data) {
      console.error("save highlight failed", error?.message);
      toast.error(`Couldn’t save the highlight${error ? `: ${error.message}` : ""}`);
      return;
    }
    setHighlights((list) => [...list, data]);
    done(sel);
  }

  // The ribbon: bookmarks the page being read, or removes its bookmark. The
  // page's opening words name it in the notes panel.
  async function toggleBookmark() {
    if (pageBookmark) return void deleteBookmark(pageBookmark);
    const here = api.current?.currentLocation();
    if (!here) return;
    setSaving(true);
    const text = here.excerpt;
    const label = text.length > BOOKMARK_LABEL_CHARS ? `${text.slice(0, BOOKMARK_LABEL_CHARS - 1).trimEnd()}…` : text || here.chapter;
    const { data, error } = await createClient()
      .from("bookmarks")
      .insert({ book_id: bookId, cfi: here.cfi, label })
      .select(BOOKMARK_COLUMNS)
      .single();
    setSaving(false);
    if (error?.code === "23505") return void toast("This page is already bookmarked");
    if (error || !data) {
      console.error("save bookmark failed", error?.message);
      toast.error(`Couldn’t save the bookmark${error ? `: ${error.message}` : ""}`);
      return;
    }
    setBookmarks((list) => [...list, data]);
  }

  // Opening an item jumps to it and shows its note field and delete button.
  // The panel stays open (on phones too) so the note can be written. A
  // highlight also becomes what the assistant will be asked about.
  const activate = ({ id, cfi }: { id: string; cfi: string }) => {
    const h = highlights.find((x) => x.id === id);
    if (h) setAskAbout(h.text);
    setActiveNote(id);
    api.current?.goTo(cfi);
  };

  // Tapping a highlight in the text opens its note in the panel, and makes
  // it what the assistant will be asked about.
  const openHighlight = (id: string) => {
    const h = highlights.find((x) => x.id === id);
    if (h) setAskAbout(h.text);
    openDrawer("right", "notes");
    setActiveNote(id);
    setFocusNote((n) => n + 1);
  };

  async function saveNote(id: string, note: string | null) {
    const { error } = await createClient().from("highlights").update({ note }).eq("id", id);
    if (error) {
      console.error("save note failed", error.message);
      toast.error(`Couldn’t save the note: ${error.message}`);
      return false;
    }
    setHighlights((list) => list.map((h) => (h.id === id ? { ...h, note } : h)));
    return true;
  }

  async function setVerified(id: string, verified: boolean) {
    setHighlights((list) => list.map((h) => (h.id === id ? { ...h, verified } : h)));
    const { error } = await createClient().from("highlights").update({ verified }).eq("id", id);
    if (error) {
      console.error("save verified failed", error.message);
      setHighlights((list) => list.map((h) => (h.id === id ? { ...h, verified: !verified } : h)));
      toast.error(`Couldn’t save that: ${error.message}`);
    }
  }

  // Copies the book as a BibTeX entry, with the highlighted passage's
  // chapter. Books indexed before publication metadata was stored fall back
  // to the EPUB's own, read by epub.js.
  function citeHighlight(h: Highlight) {
    const fromEpub = api.current?.publication();
    const entry = bookBibtex(
      {
        title,
        author,
        publisher: publication.publisher ?? fromEpub?.publisher ?? null,
        published: publication.published ?? fromEpub?.published ?? null,
        isbn: publication.isbn ?? fromEpub?.isbn ?? null,
      },
      { chapter: h.chapter_title, text: h.text, note: h.note },
    );
    void copyBib(entry);
  }

  // Deletes go through at once (the highlight disappears from the page too),
  // with an Undo that puts the same row back.
  async function deleteHighlight(h: Highlight) {
    setHighlights((list) => list.filter((x) => x.id !== h.id));
    const { error } = await createClient().from("highlights").delete().eq("id", h.id);
    if (error) {
      console.error("delete highlight failed", error.message);
      setHighlights((list) => [...list, h]);
      toast.error(`Couldn’t delete the highlight: ${error.message}`);
      return;
    }
    toast("Highlight deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { data, error } = await createClient()
            .from("highlights")
            .insert({
              id: h.id,
              book_id: bookId,
              cfi_range: h.cfi_range,
              text: h.text,
              note: h.note,
              color: h.color,
              chapter_title: h.chapter_title,
              verified: h.verified,
              created_at: h.created_at,
            })
            .select(HIGHLIGHT_COLUMNS)
            .single();
          if (error || !data) return void toast.error(`Couldn’t restore the highlight${error ? `: ${error.message}` : ""}`);
          setHighlights((list) => [...list, data]);
        },
      },
    });
  }

  async function deleteBookmark(b: Bookmark) {
    setBookmarks((list) => list.filter((x) => x.id !== b.id));
    const { error } = await createClient().from("bookmarks").delete().eq("id", b.id);
    if (error) {
      console.error("delete bookmark failed", error.message);
      setBookmarks((list) => [...list, b]);
      toast.error(`Couldn’t delete the bookmark: ${error.message}`);
      return;
    }
    toast("Bookmark deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { data, error } = await createClient()
            .from("bookmarks")
            .insert({ id: b.id, book_id: bookId, cfi: b.cfi, label: b.label, created_at: b.created_at })
            .select(BOOKMARK_COLUMNS)
            .single();
          if (error || !data) return void toast.error(`Couldn’t restore the bookmark${error ? `: ${error.message}` : ""}`);
          setBookmarks((list) => [...list, data]);
        },
      },
    });
  }

  // Stored in this browser, so read after the first (server-matching) render.
  useEffect(() => setTextSize(loadTextSize()), []);

  const cycleTextSize = () => {
    const next = nextTextSize(textSize);
    setTextSize(next);
    saveTextSize(next);
  };

  // Shortcuts: ⌘/ (Ctrl+/ elsewhere) toggles the assistant, ⌘⇧H the contents
  // and library. Pressed in the book they arrive from its iframe (see
  // onFrameKeyDown); anywhere else, on the window. The ref keeps one listener
  // seeing the current drawer and tab.
  const shortcut = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcut.current = (e: KeyboardEvent) => {
    const action = readerShortcut(e);
    if (!action) return;
    e.preventDefault();
    if (action === "assistant") {
      if (drawer === "right" && rightTab === "assistant") closeDrawer();
      else openDrawer("right", "assistant");
    } else if (drawer === "left") closeDrawer();
    else openDrawer("left");
  };
  const onShortcutKey = useCallback((e: KeyboardEvent) => shortcut.current(e), []);
  useEffect(() => {
    // Capture, so a shortcut pressed in the assistant's text box still works.
    window.addEventListener("keydown", onShortcutKey, true);
    return () => window.removeEventListener("keydown", onShortcutKey, true);
  }, [onShortcutKey]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="relative flex h-dvh flex-col bg-[#fbf9f4] text-[#1f1d1a]">
      <h1 className="sr-only">{title}</h1>
      <main className="relative min-h-0 flex-1">
        <EpubViewer
          bookId={bookId}
          userId={userId}
          fileUrl={fileUrl}
          initialCfi={initialCfi}
          initialPositionAt={initialPositionAt}
          toc={toc}
          highlights={highlights}
          onSelection={onSelection}
          onHighlightClick={openHighlight}
          onLocation={onLocation}
          onReady={(r) => (api.current = r)}
          pageMarker={<BookmarkRibbon marked={!!pageBookmark} busy={saving} onToggle={() => void toggleBookmark()} />}
          onEdgeSwipe={(side) => openDrawer(side)}
          onTap={() => setRevealControls((n) => n + 1)}
          onFrameKeyDown={onShortcutKey}
          textScale={textScale(textSize)}
        />
      </main>

      {selection && (
        <SelectionBar
          selection={selection}
          busy={saving}
          onHighlight={(color) => void saveHighlight(selection, color)}
          onAsk={() => openDrawer("right", "assistant")}
        />
      )}

      {/* Like a printed page: the chapter and a page number, nothing to chase. */}
      <footer className="flex h-9 shrink-0 items-center justify-between gap-4 px-6 font-serif text-xs text-[#8c8478]">
        <span className="truncate italic">{location?.chapter ?? ""}</span>
        <span className="tabular-nums" aria-label={location?.page ? `Page ${location.page}` : undefined}>
          {location?.page ?? ""}
        </span>
      </footer>

      <SummonControls hidden={drawer !== null} revealToken={revealControls} onOpen={(side) => openDrawer(side)} />

      <Drawer id="contents-drawer" side="left" label="Contents and library" open={drawer === "left"} onClose={closeDrawer} className="max-w-[20rem]">
        <div className="shrink-0 border-b border-[#e7e2d8] px-3 pt-3 pb-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/library" />}>
              ← Library
            </Button>
            <Button variant="ghost" size="sm" onClick={closeDrawer} aria-label="Close contents">
              <CloseIcon className="size-4" />
            </Button>
          </div>
          <p className="mt-3 px-2 font-serif text-base leading-snug italic">{title}</p>
          {author && <p className="mt-0.5 px-2 text-xs tracking-wide text-[#6b655c] uppercase">{author}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <h2 className="px-5 pt-4 text-xs tracking-wide text-[#6b655c] uppercase">Contents</h2>
          <TocList
            toc={toc}
            current={location?.chapter ?? null}
            onSelect={(href) => {
              api.current?.goTo(href);
              closeDrawer();
            }}
          />
        </div>
      </Drawer>

      <Drawer id="notes-drawer" side="right" label="Notes and assistant" open={drawer === "right"} onClose={closeDrawer} className="max-w-[24rem]">
        <div role="tablist" aria-label="Notes and assistant" className="flex h-12 shrink-0 items-center gap-1 border-b border-[#e7e2d8] px-3">
          {RIGHT_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={rightTab === id}
              aria-controls={`tabpanel-${id}`}
              onClick={() => setRightTab(id)}
              className={
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-serif text-[0.95rem] " +
                (rightTab === id ? "bg-black/[0.06] text-[#1f1d1a] italic" : "text-[#6b655c] hover:bg-black/5")
              }
            >
              <Icon className="size-[15px] opacity-70" />
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={cycleTextSize}
            aria-label={`Text size: ${textSizeLabel(textSize)}. Change text size`}
            title={`Text size: ${textSizeLabel(textSize)}`}
            className="grid h-8 w-9 place-items-center rounded-md font-serif text-[#6b655c] hover:bg-black/5 hover:text-[#1f1d1a]"
          >
            <span aria-hidden className={TEXT_SIZE_GLYPH[textSize]}>
              Aa
            </span>
          </button>
          <Button variant="ghost" size="sm" onClick={closeDrawer} aria-label="Close notes and assistant">
            <CloseIcon className="size-4" />
          </Button>
        </div>
        {/* Both stay mounted so a conversation or note draft survives a tab switch. */}
        <div id="tabpanel-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={rightTab !== "notes"} className="min-h-0 flex-1">
          <NotesPanel
            highlights={highlights}
            bookmarks={bookmarks}
            activeId={activeNote}
            focusNote={focusNote}
            onActivate={activate}
            onSaveNote={saveNote}
            onSetVerified={(id, verified) => void setVerified(id, verified)}
            onCite={citeHighlight}
            onDeleteHighlight={(h) => void deleteHighlight(h)}
            onDeleteBookmark={(b) => void deleteBookmark(b)}
          />
        </div>
        <div id="tabpanel-assistant" role="tabpanel" aria-labelledby="tab-assistant" hidden={rightTab !== "assistant"} className="min-h-0 flex-1 bg-background">
          <AssistantPanel
            bookId={bookId}
            bookTitle={title}
            ready={ready}
            getCurrentHref={() => currentHref.current}
            onCite={(href) => api.current?.goTo(href)}
            passage={askAbout}
            onPassageUsed={() => setAskAbout(null)}
          />
        </div>
      </Drawer>
    </div>
  );
}

/** Which drawer a key press toggles, if it is one of the reader's shortcuts. */
export function readerShortcut(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  if (!e.shiftKey && (e.key === "/" || e.code === "Slash")) return "assistant" as const;
  if (e.shiftKey && (e.key.toLowerCase() === "h" || e.code === "KeyH")) return "contents" as const;
  return null;
}

export function ReaderMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-[#6b655c]">{children}</div>;
}
