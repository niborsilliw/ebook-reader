"use client";

import { Fragment } from "react";
import type { ChatUIMessage } from "@/lib/chat/types";
import type { Citation } from "@/lib/rag/types";
import { citedNumbers } from "@/lib/rag/prompt";
import { hasText, isSearchingWeb } from "@/lib/chat/activity";
import { splitEmphasis } from "@/lib/chat/emphasis";
import { splitLinks } from "@/lib/chat/links";
import { CitationChips } from "./citation-chips";

type Props = {
  message: ChatUIMessage;
  bookTitle: string;
  streaming: boolean;
  onCite: (spineHref: string) => void;
};

export function MessageView({ message, bookTitle, streaming, onCite }: Props) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

  if (message.role === "user") {
    return (
      <div className="ml-8 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{text}</div>
    );
  }

  const sources = message.parts.flatMap((p) => (p.type === "data-citations" ? p.data : []));
  const byN = new Map(sources.map((s) => [s.n, s]));
  // Only sources the answer actually cites (live while streaming).
  const cited = citedNumbers(text).flatMap((n) => (byN.has(n) ? [byN.get(n)!] : []));
  // Until the answer starts, and while it searches the web, the thread's
  // status line says what is happening instead.
  const cursor = streaming && hasText(message) && !isSearchingWeb(message);

  return (
    <div className="grid gap-2">
      <div className="font-serif text-[0.95rem] leading-relaxed whitespace-pre-wrap">
        <AnswerText text={text} byN={byN} onCite={onCite} />
        {cursor && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/40 align-middle" />}
      </div>
      {!streaming && cited.length > 0 && <CitationChips citations={cited} bookTitle={bookTitle} onCite={onCite} />}
    </div>
  );
}

/**
 * Web addresses the answer cites (from a web search) as links that open in a
 * new tab, shown by their site's name so a long address doesn't break up the
 * prose.
 */
function WebLinks({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((piece, i) =>
        typeof piece === "string" ? (
          <Emphasis key={i} text={piece} />
        ) : (
          <a key={i} href={piece.href} target="_blank" rel="noopener noreferrer" title={piece.href} className="text-primary underline underline-offset-2">
            {piece.label}
          </a>
        ),
      )}
    </>
  );
}

/** *Italics* and **bold** as the model marks them, without the marks. */
function Emphasis({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text).map((piece, i) =>
        piece.em ? <em key={i}>{piece.text}</em> : piece.strong ? <strong key={i} className="font-semibold">{piece.text}</strong> : <Fragment key={i}>{piece.text}</Fragment>,
      )}
    </>
  );
}

/** Renders the answer with [n] markers as small links to the cited passage. */
function AnswerText({
  text,
  byN,
  onCite,
}: {
  text: string;
  byN: Map<number, Citation>;
  onCite: (spineHref: string) => void;
}) {
  const pieces = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return (
    <>
      {pieces.map((piece, i) => {
        const marker = piece.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
        if (!marker) return <WebLinks key={i} text={piece} />;
        return (
          <sup key={i} className="ml-0.5 font-sans text-[0.7rem]">
            {marker[1].split(",").map((raw, j) => {
              const n = Number(raw.trim());
              const source = byN.get(n);
              return (
                <Fragment key={j}>
                  {j > 0 && ","}
                  {source ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      title={source.chapter_title ?? undefined}
                      onClick={() => onCite(source.spine_href)}
                    >
                      {n}
                    </button>
                  ) : (
                    n
                  )}
                </Fragment>
              );
            })}
          </sup>
        );
      })}
    </>
  );
}
