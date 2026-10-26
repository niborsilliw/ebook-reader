"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { msSinceTouch } from "@/lib/reader/last-touch";

// The click a phone sends after a tap or swipe that opened a drawer lands on
// the backdrop that has just appeared under the finger; it mustn't close the
// drawer again, or take focus from what the drawer focused. A mouse click,
// however soon, is always meant.
const GHOST_CLICK_MS = 500;

type Props = {
  id: string;
  side: "left" | "right";
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
};

/**
 * A panel summoned over the page from one side. A click anywhere outside it
 * (on the page) sends it away. It slides over the text rather than pushing
 * it, so the page isn't re-paginated every time it opens.
 */
export function Drawer({ id, side, open, label, onClose, className, children }: Props) {
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  const isGhost = () => performance.now() - openedAt.current < GHOST_CLICK_MS && msSinceTouch() < GHOST_CLICK_MS;

  return (
    <>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${label.toLowerCase()}`}
          className="fixed inset-0 z-30 cursor-default bg-black/10"
          onMouseDown={(e) => isGhost() && e.preventDefault()}
          onClick={() => !isGhost() && onClose()}
        />
      )}
      <aside
        id={id}
        aria-label={label}
        inert={!open}
        className={cn(
          "fixed inset-y-0 z-40 flex w-[85%] flex-col overflow-hidden bg-[#fbf9f4] shadow-xl duration-200 ease-out motion-reduce:transition-none",
          side === "left" ? "left-0 border-r border-[#e7e2d8]" : "right-0 border-l border-[#e7e2d8]",
          // Visible at once when opening (so it can take focus), but only
          // hidden once the closing slide has finished.
          open
            ? "translate-x-0 transition-[translate]"
            : cn("invisible transition-[translate,visibility]", side === "left" ? "-translate-x-full" : "translate-x-full"),
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}
