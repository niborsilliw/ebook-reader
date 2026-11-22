"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BooksIcon, DialogueIcon } from "./icons";

// After a tap on the page, how long the buttons stay at full strength.
const TAP_REVEAL_MS = 3500;
// When the book opens, how long they show at full strength before settling
// back, so a first-time reader sees where they are.
const INTRO_MS = 4000;

type Side = "left" | "right";

const LABEL: Record<Side, string> = { left: "Contents and library", right: "Notes and assistant" };

/**
 * The drawers' buttons, one in each top corner: always there, faint at rest
 * so they don't compete with the page, and at full strength when wanted.
 *
 * - For a mouse: the pointer coming near a corner brings its button up. The
 *   corner zones take pointer events wherever any mouse or trackpad is
 *   attached (`any-pointer`, not `pointer`: some Macs report their primary
 *   pointer as something other than "fine"), are driven by pointer events in
 *   script rather than CSS :hover, and sit above the book's iframe (z-50).
 * - For touch: a tap on the page brings both up for a few seconds
 *   (`revealToken` changes); the buttons can be tapped at any time.
 * - For the keyboard: the buttons come up when focused; the shell has shortcuts.
 */
export function SummonControls({ hidden, revealToken, onOpen }: { hidden: boolean; revealToken: number; onOpen: (side: Side) => void }) {
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  const [tapShown, setTapShown] = useState(false);
  useEffect(() => {
    if (!revealToken) return;
    setTapShown(true);
    const t = setTimeout(() => setTapShown(false), TAP_REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealToken]);

  // The corner the mouse is in, if any.
  const [near, setNear] = useState<Side | null>(null);
  useEffect(() => {
    if (hidden) setNear(null);
  }, [hidden]);

  if (hidden) return null;
  return (
    <>
      {(["left", "right"] as const).map((side) => {
        const up = intro || tapShown || near === side;
        return (
          <div
            key={side}
            data-testid={`corner-${side}`}
            className={cn(
              // The zone lets touches through to the page on touch-only
              // screens; the button itself always takes them.
              "pointer-events-none fixed top-0 z-50 flex h-20 w-28 items-start p-2 [@media(any-pointer:fine)]:pointer-events-auto",
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
                "pointer-events-auto grid size-10 place-items-center rounded-full border text-[#6b655c] transition-[opacity,background-color,border-color] duration-300 hover:bg-black/[0.06] hover:text-[#1f1d1a] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#8c8478]",
                up ? "border-[#e7e2d8] bg-[#fbf9f4] opacity-100 shadow-sm" : "border-transparent opacity-45",
              )}
            >
              {side === "left" ? <BooksIcon className="size-5" /> : <DialogueIcon className="size-5" />}
            </button>
          </div>
        );
      })}
    </>
  );
}
