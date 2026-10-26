"use client";

import { cn } from "@/lib/utils";

/**
 * A ribbon hanging from the top of the page, beside the text. Only its tip
 * peeks out until the page is bookmarked; then it drops down, coloured, like
 * the ribbon marker in a hardback.
 */
export function BookmarkRibbon({ marked, busy, onToggle }: { marked: boolean; busy: boolean; onToggle: () => void }) {
  const label = marked ? "Remove bookmark from this page" : "Bookmark this page";
  return (
    <button
      type="button"
      aria-pressed={marked}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onToggle}
      // In the page's right margin from sm up; on phones, which have no
      // margin, over the strip that holds the next-page chevron.
      className="group absolute top-0 -right-[1.4rem] z-10 flex h-14 w-7 justify-center overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c8478] sm:right-1"
    >
      <svg
        aria-hidden
        viewBox="0 0 18 44"
        className={cn(
          "h-11 w-[18px] transition-[translate,fill] duration-300 ease-out motion-reduce:transition-none",
          marked
            ? "translate-y-0 fill-[#8f2d2a]"
            : "-translate-y-[30px] fill-[#ddd5c7] group-hover:-translate-y-[24px] group-hover:fill-[#cbc0ad] group-focus-visible:-translate-y-[24px] group-focus-visible:fill-[#cbc0ad]",
        )}
      >
        {/* A strip of ribbon with a swallowtail end. */}
        <path d="M0 0h18v44l-9-7-9 7z" />
        {marked && <path d="M0 0h18v3H0z" className="fill-black/15" />}
      </svg>
    </button>
  );
}
