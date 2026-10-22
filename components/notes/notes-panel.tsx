"use client";

import { Button } from "@/components/ui/button";

type Props = {
  onClose: () => void;
};

// Bookmarks first, then highlights grouped by chapter. Both are empty until
// highlighting and bookmarking land; this is the panel shell.
export function NotesPanel({ onClose }: Props) {
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
          <Empty>No bookmarks yet.</Empty>
        </Section>
        <Section title="Highlights">
          <Empty>No highlights yet. Highlights and notes you make while reading will appear here, grouped by chapter.</Empty>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-sm leading-relaxed text-[#6b655c]">{children}</p>;
}
