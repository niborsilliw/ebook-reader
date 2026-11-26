"use client";

import type { TocEntry } from "@/lib/epub/parse";
import { useStrings } from "@/lib/i18n/client";

export function TocList({ toc, current, onSelect }: { toc: TocEntry[]; current: string | null; onSelect: (href: string) => void }) {
  const t = useStrings();
  if (toc.length === 0) return <p className="px-5 py-3 font-serif text-sm text-[#6b655c]">{t.noToc}</p>;
  return (
    <nav aria-label={t.toc}>
      <ol className="py-2">
        {toc.map((entry, i) => {
          const here = entry.title === current;
          return (
            <li key={`${entry.href}-${i}`}>
              <button
                type="button"
                aria-current={here ? "location" : undefined}
                className={
                  "block w-full py-1.5 pr-5 text-left font-serif text-[0.95rem] leading-snug hover:bg-black/5 " +
                  (here ? "text-[#1f1d1a] italic" : "text-[#4a453e]")
                }
                style={{ paddingLeft: `${1.25 + entry.level * 1}rem` }}
                onClick={() => onSelect(entry.href)}
              >
                {entry.title}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
