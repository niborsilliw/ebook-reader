"use client";

import { useState } from "react";
import type { TocEntry } from "@/lib/epub/parse";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function TocSheet({ toc, onSelect }: { toc: TocEntry[]; onSelect: (href: string) => void }) {
  const [open, setOpen] = useState(false);
  if (toc.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="sm" />}>Contents</SheetTrigger>
      <SheetContent side="left" className="w-80 bg-[#fbf9f4] p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-serif text-base font-normal italic">Contents</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-4rem)]">
          <nav aria-label="Table of contents">
            <ol className="py-2">
              {toc.map((entry, i) => (
                <li key={`${entry.href}-${i}`}>
                  <button
                    type="button"
                    className="block w-full px-5 py-1.5 text-left font-serif text-[0.95rem] leading-snug text-[#1f1d1a] hover:bg-black/5"
                    style={{ paddingLeft: `${1.25 + entry.level * 1}rem` }}
                    onClick={() => {
                      onSelect(entry.href);
                      setOpen(false);
                    }}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
