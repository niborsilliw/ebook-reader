"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BooksIcon, DialogueIcon } from "./icons";

// How long the pointer must rest against a screen edge to open its drawer, so
// passing over the edge (say, on the way to the page-turn margins) doesn't.
const EDGE_DWELL_MS = 300;
// After a tap on the page, how long the corner buttons stay up on a touch screen.
const TAP_REVEAL_MS = 3500;

// Mouse-only zones take pointer events wherever any mouse or trackpad is
// attached. `any-pointer`, not `pointer`: some Macs report their primary
// pointer as something other than "fine", which hid these zones (and CSS
// :hover reveals gated on `hover: hover`) for those readers. Touch-only
// screens keep letting touches through to the page.
const MOUSE_ZONE = "pointer-events-none [@media(any-pointer:fine)]:pointer-events-auto";

type Side = "left" | "right";

const LABEL: Record<Side, string> = { left: "Contents and library", right: "Notes and assistant" };

/**
 * The reader's only resident chrome, nearly all of it invisible until wanted.
 * It sits above the book's iframe (z-50) so the iframe never takes its
 * pointer events.
 *
 * - For a mouse: a small button in each top corner, shown when the pointer
 *   comes near that corner, and a thin zone along each side edge that opens
 *   that side's drawer when the pointer rests on it. Both are driven by
 *   pointer events in script rather than CSS :hover.
 * - For anyone: a faint tab half-way down each side edge, a click on which
 *   opens that side's drawer. The one always-visible mark, for readers who
 *   haven't found the others.
 * - For touch: a tap on the page shows the corner buttons for a few seconds
 *   (`revealToken` changes); swiping in from an edge is handled by the viewer.
 * - For the keyboard: the buttons appear when focused; the shell has shortcuts.
 */
export function SummonControls({ hidden, revealToken, onOpen }: { hidden: boolean; revealToken: number; onOpen: (side: Side) => void }) {
  const [tapShown, setTapShown] = useState(false);
  useEffect(() => {
    if (!revealToken) return;
    setTapShown(true);
    const t = setTimeout(() => setTapShown(false), TAP_REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealToken]);

  // The corner the mouse is in, if any.
  const [near, setNear] = useState<Side | null>(null);

  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restOn = (side: Side) => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => onOpen(side), EDGE_DWELL_MS);
  };
  const leave = () => clearTimeout(dwell.current);
  useEffect(() => () => clearTimeout(dwell.current), []);
  useEffect(() => {
    if (hidden) setNear(null);
  }, [hidden]);

  if (hidden) return null;
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div key={side}>
          {/* Edge zone: mouse only. */}
          <div
            aria-hidden
            data-testid={`edge-${side}`}
            className={cn("fixed inset-y-0 z-50 w-3", MOUSE_ZONE, side === "left" ? "left-0" : "right-0")}
            onPointerEnter={(e) => e.pointerType !== "touch" && restOn(side)}
            onPointerLeave={leave}
          />
          {/* The visible fallback: a faint vertical tab mid-way down the edge.
              The hit area is wider and taller than the mark. */}
          <button
            type="button"
            aria-label={`Open ${LABEL[side].toLowerCase()}`}
            title={LABEL[side]}
            onClick={() => onOpen(side)}
            className={cn(
              "group/tab pointer-events-auto fixed top-1/2 z-50 flex h-20 w-5 -translate-y-1/2 items-center focus-visible:outline-none",
              side === "left" ? "left-0 justify-start pl-1" : "right-0 justify-end pr-1",
            )}
          >
            <span
              aria-hidden
              className="block h-12 w-[3px] rounded-full bg-[#8c8478]/25 transition-colors duration-200 group-hover/tab:bg-[#8c8478]/60 group-focus-visible/tab:bg-[#8c8478]"
            />
          </button>
          {/* Corner: the pointer entering the zone shows its button. */}
          <div
            data-testid={`corner-${side}`}
            className={cn(
              "fixed top-0 z-50 flex h-16 w-24 items-start p-2",
              MOUSE_ZONE,
              side === "left" ? "left-0 justify-start" : "right-0 justify-end max-sm:right-8",
            )}
            onPointerEnter={(e) => e.pointerType !== "touch" && setNear(side)}
            onPointerLeave={() => setNear((s) => (s === side ? null : s))}
          >
            <button
              type="button"
              aria-label={LABEL[side]}
              title={LABEL[side]}
              onClick={() => onOpen(side)}
              className={cn(
                "pointer-events-auto grid size-8 place-items-center rounded-full text-[#8c8478] transition-opacity duration-200 hover:bg-black/5 hover:text-[#1f1d1a] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#8c8478]",
                tapShown || near === side ? "opacity-100" : "opacity-0",
                // Hidden and over a touch-only screen: let the touch reach the page.
                !tapShown && near !== side && "[@media(not_(any-pointer:fine))]:pointer-events-none",
              )}
            >
              {side === "left" ? <BooksIcon /> : <DialogueIcon />}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
