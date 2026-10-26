"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Save a moment after typing stops, and whenever the reader leaves the page.
const SAVE_AFTER_MS = 1000;
const RETRY_AFTER_MS = 5000;

type Status = "idle" | "saving" | "saved" | "error";

/**
 * A free-form notebook for the whole book (not tied to any highlight): one
 * quiet page of text, saved as you write.
 */
export function Notebook({ bookId, initialBody }: { bookId: string; initialBody: string }) {
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<Status>("idle");
  const latest = useRef(initialBody); // what's in the field
  const saved = useRef(initialBody); // what the database has
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Saves run one at a time, so an older save can never land after a newer one.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const text = latest.current;
      if (text === saved.current) return;
      setStatus("saving");
      const { error } = await createClient()
        .from("notebooks")
        .upsert({ book_id: bookId, body: text }, { onConflict: "user_id,book_id" });
      if (error) {
        console.error("save notebook failed", error.message);
        setStatus("error");
        timer.current = setTimeout(save, RETRY_AFTER_MS);
        return;
      }
      saved.current = text;
      // If more was typed meanwhile, its own timer will save it.
      setStatus(latest.current === text ? "saved" : "idle");
    });
    return queue.current;
  }, [bookId]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void save();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      void save(); // leaving the book
    };
  }, [save]);

  return (
    <div className="flex h-full flex-col bg-[#fbf9f4]">
      <label htmlFor="notebook" className="sr-only">
        Notebook for this book
      </label>
      <textarea
        id="notebook"
        value={body}
        placeholder="Loose thoughts on the whole book: questions, connections, things to look up…"
        spellCheck
        onChange={(e) => {
          setBody(e.target.value);
          latest.current = e.target.value;
          setStatus((s) => (s === "error" ? s : "idle"));
          clearTimeout(timer.current);
          timer.current = setTimeout(save, SAVE_AFTER_MS);
        }}
        onBlur={() => void save()}
        className="min-h-0 flex-1 resize-none bg-transparent px-6 pt-5 pb-2 font-book text-[0.95rem] leading-[1.75] text-[#1f1d1a] placeholder:text-[#a39b8e] placeholder:italic focus:outline-none"
      />
      <p aria-live="polite" className="h-8 shrink-0 px-6 font-book text-[0.7rem] text-[#8c8478] italic">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn’t save; trying again shortly" : ""}
      </p>
    </div>
  );
}
