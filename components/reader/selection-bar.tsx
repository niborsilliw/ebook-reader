"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { BookSelection } from "./epub-viewer";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@/lib/notes/colors";

const GAP = 8; // between the bar and the selection
const EDGE = 8; // minimum distance from the screen edges

type Props = {
  selection: BookSelection;
  busy: boolean;
  onHighlight: (color: HighlightColor) => void;
  onBookmark: () => void;
};

/**
 * Floating actions for a text selection. Kept inside the viewport: centred on
 * the selection, clamped to the screen edges, and placed below the selection on
 * touch screens, where the system's own copy/share menu appears above it.
 */
export function SelectionBar({ selection, busy, onHighlight, onBookmark }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const { width, height } = bar.getBoundingClientRect();
    const { rect } = selection;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const above = rect.top - GAP - height;
    const below = rect.bottom + GAP;
    const preferBelow = window.matchMedia("(pointer: coarse)").matches;
    const fitsAbove = above >= EDGE;
    const fitsBelow = below + height <= vh - EDGE;
    let top = preferBelow ? (fitsBelow ? below : above) : fitsAbove ? above : below;
    top = Math.min(Math.max(top, EDGE), vh - height - EDGE);
    const centre = (rect.left + rect.right) / 2;
    const left = Math.min(Math.max(centre - width / 2, EDGE), vw - width - EDGE);
    setPos({ left, top });
  }, [selection]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      className="fixed z-40 flex overflow-hidden rounded-full border border-[#e7e2d8] bg-[#1f1d1a] text-sm text-[#fbf9f4] shadow-lg"
      // Keep the selection: a mousedown here would otherwise clear it first.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div role="group" aria-label="Highlight" className="flex items-center gap-1 pr-1.5 pl-2.5">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => onHighlight(c.id)}
            aria-label={`Highlight ${c.label.toLowerCase()}`}
            title={`Highlight ${c.label.toLowerCase()}`}
            className="grid size-8 place-items-center rounded-full hover:bg-white/10 disabled:opacity-50"
          >
            <span aria-hidden className="size-4 rounded-full ring-1 ring-white/30" style={{ background: c.fill }} />
          </button>
        ))}
      </div>
      <span aria-hidden className="w-px bg-white/15" />
      <BarButton disabled={busy} onClick={onBookmark}>
        Bookmark
      </BarButton>
    </div>
  );
}

function BarButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center px-3.5 py-2 whitespace-nowrap hover:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
