"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NibIcon, SpineIcon } from "./icons";

// How long the pointer must rest against a screen edge to open its drawer, so
// passing over the edge (say, on the way to the page-turn arrows) doesn't.
const EDGE_DWELL_MS = 300;
// After a tap on the page, how long the corner buttons stay up on a touch screen.
const TAP_REVEAL_MS = 3500;

type Side = "left" | "right";

/**
 * The reader's only resident chrome, all of it invisible until wanted:
 *
 * - For a mouse: a small button in each top corner, shown when the pointer
 *   comes near that corner, and a thin zone along each side edge that opens
 *   that side's drawer when the pointer rests on it.
 * - For touch: a tap on the page shows the corner buttons for a few seconds
 *   (`revealToken` changes); swiping in from an edge is handled by the viewer.
 * - For the keyboard: the buttons appear when focused.
 */
export function SummonControls({ hidden, revealToken, onOpen }: { hidden: boolean; revealToken: number; onOpen: (side: Side) => void }) {
  const [tapShown, setTapShown] = useState(false);
  useEffect(() => {
    if (!revealToken) return;
    setTapShown(true);
    const t = setTimeout(() => setTapShown(false), TAP_REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealToken]);

  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restOn = (side: Side) => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => onOpen(side), EDGE_DWELL_MS);
  };
  const leave = () => clearTimeout(dwell.current);
  useEffect(() => () => clearTimeout(dwell.current), []);

  if (hidden) return null;
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div key={side}>
          {/* Edge zone: mouse only (hover-capable, fine pointer). */}
          <div
            aria-hidden
            className={cn("fixed inset-y-0 z-20 hidden w-3 pointer-fine:block", side === "left" ? "left-0" : "right-0")}
            onMouseEnter={() => restOn(side)}
            onMouseLeave={leave}
          />
          {/* Corner: hovering the zone shows its button. On touch screens the
              zone lets touches through, and a tap on the page shows the button. */}
          <div
            className={cn(
              "group fixed top-0 z-20 flex h-16 w-24 items-start p-2 pointer-coarse:pointer-events-none",
              side === "left" ? "left-0 justify-start" : "right-0 justify-end max-sm:right-8",
            )}
          >
            <button
              type="button"
              aria-label={side === "left" ? "Contents and library" : "Notes and assistant"}
              title={side === "left" ? "Contents and library" : "Notes and assistant"}
              onClick={() => onOpen(side)}
              className={cn(
                "grid size-8 place-items-center rounded-full text-[#8c8478] transition-opacity duration-200 hover:bg-black/5 hover:text-[#1f1d1a] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#8c8478] group-hover:opacity-100",
                tapShown ? "pointer-events-auto opacity-100" : "opacity-0",
              )}
            >
              {side === "left" ? <SpineIcon /> : <NibIcon />}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
