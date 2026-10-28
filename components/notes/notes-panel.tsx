"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorFill } from "@/lib/notes/colors";
import { compareCfi, groupByChapter } from "@/lib/notes/order";
import type { Bookmark, Highlight } from "@/lib/notes/types";

type Props = {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  /** The highlight or bookmark id that is open (note field and delete shown). */
  activeId: string | null;
  /** Bumped to move focus to the active highlight's note field. */
  focusNote: number;
  onActivate: (item: { id: string; cfi: string }) => void;
  onSaveNote: (id: string, note: string | null) => Promise<boolean>;
  onSetVerified: (id: string, verified: boolean) => void;
  /** Downloads a BibTeX entry for the book at this highlight. */
  onCite: (h: Highlight) => void;
  onDeleteHighlight: (h: Highlight) => void;
  onDeleteBookmark: (b: Bookmark) => void;
};

// Bookmarks first, then highlights grouped by chapter; both in reading order.
export function NotesPanel({
  highlights,
  bookmarks,
  activeId,
  focusNote,
  onActivate,
  onSaveNote,
  onSetVerified,
  onCite,
  onDeleteHighlight,
  onDeleteBookmark,
}: Props) {
  const chapters = useMemo(() => groupByChapter(highlights), [highlights]);
  const marks = useMemo(() => [...bookmarks].sort((a, b) => compareCfi(a.cfi, b.cfi)), [bookmarks]);

  return (
    <div className="flex h-full flex-col bg-[#fbf9f4]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Bookmarks">
          {marks.length === 0 ? (
            <Empty>No bookmarks yet. Tap the ribbon at the top corner of a page to mark it.</Empty>
          ) : (
            <ul className="-mx-2">
              {marks.map((b) => (
                <Item
                  key={b.id}
                  active={activeId === b.id}
                  onActivate={() => onActivate({ id: b.id, cfi: b.cfi })}
                  onDelete={() => onDeleteBookmark(b)}
                  deleteLabel="Delete bookmark"
                >
                  <span className="flex gap-2">
                    <RibbonIcon />
                    <span className="line-clamp-2 min-w-0">{b.label || "Bookmark"}</span>
                  </span>
                </Item>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Highlights">
          {chapters.length === 0 ? (
            <Empty>No highlights yet. Select some text and pick a colour; it will appear here, grouped by chapter.</Empty>
          ) : (
            chapters.map((group) => (
              <div key={group.chapter} className="mb-4 last:mb-0">
                <h4 className="mb-1 font-serif text-[0.85rem] text-[#1f1d1a] italic">{group.chapter}</h4>
                <ul className="-mx-2">
                  {group.items.map((h) => {
                    const active = activeId === h.id;
                    return (
                      <Item
                        key={h.id}
                        active={active}
                        onActivate={() => onActivate({ id: h.id, cfi: h.cfi_range })}
                        onDelete={() => onDeleteHighlight(h)}
                        deleteLabel="Delete highlight"
                        below={
                          active ? (
                            <>
                              <NoteField highlight={h} focusToken={focusNote} onSave={onSaveNote} />
                              <AcademicRow highlight={h} onSetVerified={onSetVerified} onCite={onCite} />
                            </>
                          ) : (
                            (h.note || h.verified) && (
                              <span className="mt-1 block px-2 pl-[19px] text-xs text-[#6b655c]">
                                {h.note}
                                {h.verified && <span className={h.note ? "ml-1.5 italic" : "italic"}>✓ Verified</span>}
                              </span>
                            )
                          )
                        }
                      >
                        <span
                          className={active ? "block border-l-[3px] pl-2" : "line-clamp-3 border-l-[3px] pl-2"}
                          style={{ borderColor: colorFill(h.color) }}
                        >
                          {h.text}
                        </span>
                      </Item>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function Item({
  children,
  below,
  active,
  onActivate,
  onDelete,
  deleteLabel,
}: {
  children: React.ReactNode;
  below?: React.ReactNode;
  active: boolean;
  onActivate: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <li className={active ? "rounded-md bg-black/[0.04] pb-2" : undefined}>
      <div className="flex items-start">
        <button
          type="button"
          aria-expanded={active}
          onClick={onActivate}
          className="block min-w-0 flex-1 rounded-md px-2 py-1.5 text-left font-serif text-sm leading-snug text-[#1f1d1a] hover:bg-black/5"
        >
          {children}
        </button>
        {active && (
          <button
            type="button"
            aria-label={deleteLabel}
            title={deleteLabel}
            onClick={onDelete}
            className="mt-0.5 mr-1 grid size-7 shrink-0 place-items-center rounded-md text-[#8c8478] hover:bg-black/5 hover:text-[#b4232c]"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {below}
    </li>
  );
}

// A quiet note field: saves on blur or ⌘/Ctrl+Enter, Escape reverts.
function NoteField({
  highlight,
  focusToken,
  onSave,
}: {
  highlight: Highlight;
  focusToken: number;
  onSave: (id: string, note: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(highlight.note ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusToken) ref.current?.focus();
  }, [focusToken]);

  async function save() {
    const note = draft.trim() || null;
    if (note === (highlight.note ?? null)) return;
    setStatus("saving");
    setStatus((await onSave(highlight.id, note)) ? "saved" : "error");
  }

  return (
    <div className="px-2 pt-1 pl-[19px]">
      <label className="sr-only" htmlFor={`note-${highlight.id}`}>
        Note
      </label>
      <textarea
        ref={ref}
        id={`note-${highlight.id}`}
        rows={2}
        value={draft}
        placeholder="Add a note…"
        onChange={(e) => {
          setDraft(e.target.value);
          setStatus("idle");
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") {
            e.stopPropagation(); // don't close the panel
            setDraft(highlight.note ?? "");
            setStatus("idle");
          }
        }}
        className="field-sizing-content block max-h-48 min-h-[2.5rem] w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 font-serif text-sm text-[#1f1d1a] placeholder:text-[#a39b8e] focus:border-[#e7e2d8] focus:bg-white focus:outline-none"
      />
      <p aria-live="polite" className="h-4 px-2 text-[0.7rem] text-[#8c8478]">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn’t save" : ""}
      </p>
    </div>
  );
}

// Under an open highlight's note: mark the passage as checked against the
// text, and cite the book at this passage. Quiet, like a margin note.
function AcademicRow({
  highlight,
  onSetVerified,
  onCite,
}: {
  highlight: Highlight;
  onSetVerified: (id: string, verified: boolean) => void;
  onCite: (h: Highlight) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 pl-[27px] text-xs text-[#6b655c]">
      <label className="flex cursor-pointer items-center gap-1.5 italic">
        <input
          type="checkbox"
          checked={highlight.verified}
          onChange={(e) => onSetVerified(highlight.id, e.target.checked)}
          className="size-3.5 accent-[#6b655c]"
        />
        Verified
      </label>
      <button
        type="button"
        onClick={() => onCite(highlight)}
        title="Download a BibTeX citation for the book at this passage"
        className="rounded px-1.5 py-0.5 italic underline-offset-2 hover:text-[#1f1d1a] hover:underline"
      >
        Cite this
      </button>
    </div>
  );
}

// The page ribbon in miniature, so bookmarks read as page markers, not text.
function RibbonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 18 44" className="mt-0.5 h-4 w-[7px] shrink-0 fill-[#8f2d2a]">
      <path d="M0 0h18v44l-9-7-9 7z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#e7e2d8] px-4 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs tracking-wide text-[#6b655c] uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-sm leading-relaxed text-[#6b655c]">{children}</p>;
}
