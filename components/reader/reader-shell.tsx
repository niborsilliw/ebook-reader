"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { TocEntry } from "@/lib/epub/parse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TocSheet } from "./toc-sheet";
import type { ReaderApi } from "./epub-viewer";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

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
};

export function ReaderShell({ bookId, userId, title, author, fileUrl, initialCfi, toc, ready }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [chapter, setChapter] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const api = useRef<ReaderApi | null>(null);
  const currentHref = useRef<string | null>(null);

  const onLocation = useCallback((loc: { chapter: string | null; percentage: number | null; href: string }) => {
    setChapter(loc.chapter);
    setPercent(loc.percentage);
    currentHref.current = loc.href;
  }, []);

  return (
    <div className="flex h-[calc(100dvh-3rem)] bg-[#fbf9f4] text-[#1f1d1a]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-2 text-sm">
          <Button variant="ghost" size="sm" render={<Link href="/library" />}>
            ← Library
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
            onClick={() => setPanelOpen((o) => !o)}
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
            onLocation={onLocation}
            onReady={(r) => (api.current = r)}
          />
        </main>

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
