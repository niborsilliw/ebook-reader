"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { compareCfi, groupByChapter } from "@/lib/notes/order";
import type { Bookmark, Highlight } from "@/lib/notes/types";

type Props = {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onJump: (cfi: string) => void;
  onClose: () => void;
};

// Bookmarks first, then highlights grouped by chapter; both in reading order.
export function NotesPanel({ highlights, bookmarks, onJump, onClose }: Props) {
  const chapters = useMemo(() => groupByChapter(highlights), [highlights]);
  const marks = useMemo(() => [...bookmarks].sort((a, b) => compareCfi(a.cfi, b.cfi)), [bookmarks]);

  return (
    <div className="flex h-full flex-col bg-[#fbf9f4]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#e7e2d8] px-3">
        <h2 className="flex-1 truncate pl-1 font-serif text-[0.95rem] italic">Notes &amp; highlights</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close notes">
          ✕
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Bookmarks">
          {marks.length === 0 ? (
            <Empty>No bookmarks yet. Select some text on a page and choose Bookmark.</Empty>
          ) : (
            <ul className="-mx-2">
              {marks.map((b) => (
                <li key={b.id}>
                  <Item onClick={() => onJump(b.cfi)}>
                    <span className="line-clamp-2">{b.label || "Bookmark"}</span>
                  </Item>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Highlights">
          {chapters.length === 0 ? (
            <Empty>No highlights yet. Select some text and choose Highlight; it will appear here, grouped by chapter.</Empty>
          ) : (
            chapters.map((group) => (
              <div key={group.chapter} className="mb-4 last:mb-0">
                <h4 className="mb-1 font-serif text-[0.85rem] text-[#1f1d1a] italic">{group.chapter}</h4>
                <ul className="-mx-2">
                  {group.items.map((h) => (
                    <li key={h.id}>
                      <Item onClick={() => onJump(h.cfi_range)}>
                        <span className="line-clamp-3 border-l-[3px] border-[#f5d76e] pl-2">{h.text}</span>
                        {h.note && <span className="mt-1 block pl-[11px] text-xs text-[#6b655c]">{h.note}</span>}
                      </Item>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
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

function Item({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1.5 text-left font-serif text-sm leading-snug text-[#1f1d1a] hover:bg-black/5"
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-sm leading-relaxed text-[#6b655c]">{children}</p>;
}
