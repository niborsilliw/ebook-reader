"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TocEntry } from "@/lib/epub/parse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TocSheet } from "./toc-sheet";
import type { BookSelection, ReaderApi } from "./epub-viewer";
import { SelectionBar } from "./selection-bar";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { createClient } from "@/lib/supabase/browser";
import { BOOKMARK_COLUMNS, HIGHLIGHT_COLUMNS, type Bookmark, type Highlight } from "@/lib/notes/types";

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
  fileUrl: string;
  initialCfi: string | null;
  toc: TocEntry[];
  ready: boolean;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
};

const BOOKMARK_LABEL_CHARS = 80;

export function ReaderShell({
  bookId,
  userId,
  title,
  author,
  fileUrl,
  initialCfi,
  toc,
  ready,
  initialHighlights,
  initialBookmarks,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [selection, setSelection] = useState<BookSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [chapter, setChapter] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const api = useRef<ReaderApi | null>(null);
  const currentHref = useRef<string | null>(null);

  const onLocation = useCallback((loc: { chapter: string | null; percentage: number | null; href: string }) => {
    setChapter(loc.chapter);
    setPercent(loc.percentage);
    currentHref.current = loc.href;
  }, []);

  // Below lg there isn't room for the page between two docked panels, so
  // opening one closes the other.
  const narrow = () => !window.matchMedia("(min-width: 1024px)").matches;
  const toggleNotes = () => {
    if (!notesOpen && narrow()) setPanelOpen(false);
    setNotesOpen((o) => !o);
  };
  const toggleAssistant = () => {
    if (!panelOpen && narrow()) setNotesOpen(false);
    setPanelOpen((o) => !o);
  };

  const done = (sel: BookSelection) => {
    sel.clear();
    setSelection(null);
  };

  async function saveHighlight(sel: BookSelection) {
    setSaving(true);
    const { data, error } = await createClient()
      .from("highlights")
      .insert({ book_id: bookId, cfi_range: sel.cfiRange, text: sel.text, chapter_title: sel.chapter })
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

  // Bookmarks mark the page being read; the selected text names it.
  async function saveBookmark(sel: BookSelection) {
    const here = api.current?.currentLocation();
    if (!here) return;
    setSaving(true);
    const label = sel.text.length > BOOKMARK_LABEL_CHARS ? `${sel.text.slice(0, BOOKMARK_LABEL_CHARS - 1).trimEnd()}…` : sel.text;
    const { data, error } = await createClient()
      .from("bookmarks")
      .insert({ book_id: bookId, cfi: here.cfi, label })
      .select(BOOKMARK_COLUMNS)
      .single();
    setSaving(false);
    if (error?.code === "23505") {
      toast("This page is already bookmarked");
      done(sel);
      return;
    }
    if (error || !data) {
      console.error("save bookmark failed", error?.message);
      toast.error(`Couldn’t save the bookmark${error ? `: ${error.message}` : ""}`);
      return;
    }
    setBookmarks((list) => [...list, data]);
    toast("Bookmarked");
    done(sel);
  }

  const jumpTo = (cfi: string) => {
    api.current?.goTo(cfi);
    // On phones the panel covers the page; get out of the way.
    if (!window.matchMedia("(min-width: 640px)").matches) setNotesOpen(false);
  };

  useEffect(() => {
    if (!notesOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotesOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen]);

  return (
    <div className="flex h-[calc(100dvh-3rem)] bg-[#fbf9f4] text-[#1f1d1a]">
      {/* Notes: docked on the left from sm up (the width animates, pushing the
          page over), sliding over the page on phones. */}
      <aside
        id="notes-panel"
        aria-label="Notes and highlights"
        inert={!notesOpen}
        className={cn(
          "shrink-0 overflow-hidden bg-[#fbf9f4] transition-[width,translate,visibility] duration-200 ease-out motion-reduce:transition-none",
          "max-sm:absolute max-sm:inset-x-0 max-sm:top-12 max-sm:bottom-0 max-sm:z-30 max-sm:w-[85%] max-sm:max-w-[20rem] max-sm:shadow-xl",
          notesOpen ? "border-r border-[#e7e2d8] sm:w-[20rem]" : "invisible max-sm:-translate-x-full sm:w-0",
        )}
      >
        {/* Fixed width so the contents don't reflow while the panel animates. */}
        <div className="h-full w-full sm:w-[20rem]">
          <NotesPanel highlights={highlights} bookmarks={bookmarks} onJump={jumpTo} onClose={() => setNotesOpen(false)} />
        </div>
      </aside>
      {notesOpen && (
        <button
          type="button"
          aria-label="Close notes"
          className="absolute inset-x-0 top-12 bottom-0 z-20 bg-black/15 sm:hidden"
          onClick={() => setNotesOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-2 text-sm">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/library" />}>
            ← Library
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={notesOpen}
            aria-controls="notes-panel"
            onClick={toggleNotes}
          >
            Notes
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-serif text-[0.95rem] italic">{title}</p>
            {author && <p className="truncate text-xs tracking-wide text-[#6b655c] uppercase">{author}</p>}
          </div>
          <TocSheet toc={toc} onSelect={(href) => api.current?.goTo(href)} />
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={panelOpen}
            aria-controls="assistant-panel"
            onClick={toggleAssistant}
          >
            Assistant
          </Button>
        </header>

        <main className="relative min-h-0 flex-1">
          <EpubViewer
            bookId={bookId}
            userId={userId}
            fileUrl={fileUrl}
            initialCfi={initialCfi}
            toc={toc}
            highlights={highlights}
            onSelection={setSelection}
            onLocation={onLocation}
            onReady={(r) => (api.current = r)}
          />
        </main>

        {selection && (
          <SelectionBar
            selection={selection}
            busy={saving}
            onHighlight={() => void saveHighlight(selection)}
            onBookmark={() => void saveBookmark(selection)}
          />
        )}

        <footer className="flex h-9 items-center justify-between px-6 text-xs text-[#6b655c]">
          <span className="truncate">{chapter ?? ""}</span>
          <span className="tabular-nums">{percent == null ? "" : `${Math.round(percent * 100)}%`}</span>
        </footer>
      </div>

      <aside
        id="assistant-panel"
        aria-label="Research assistant"
        hidden={!panelOpen}
        className={cn(
          "w-full shrink-0 border-l border-[#e7e2d8] bg-background sm:w-[24rem]",
          "max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-12 max-sm:z-20",
        )}
      >
        <AssistantPanel
          bookId={bookId}
          bookTitle={title}
          ready={ready}
          getCurrentHref={() => currentHref.current}
          onCite={(href) => api.current?.goTo(href)}
          onClose={() => setPanelOpen(false)}
        />
      </aside>
    </div>
  );
}

export function ReaderMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-[#6b655c]">{children}</div>;
}
