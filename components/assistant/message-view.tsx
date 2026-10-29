"use client";

import { Fragment } from "react";
import type { ChatUIMessage } from "@/lib/chat/types";
import type { Citation } from "@/lib/rag/types";
import { citedNumbers } from "@/lib/rag/prompt";
import { hasText, isSearchingWeb } from "@/lib/chat/activity";
import { splitEmphasis } from "@/lib/chat/emphasis";
import { webCitations, type CitedPiece } from "@/lib/chat/links";
import { CitationChips } from "./citation-chips";
import { CopyIcon } from "@/components/reader/icons";
import { copyText } from "@/lib/cite/copy";
import { splitPassage } from "@/lib/chat/passage";
import { toast } from "sonner";

type Props = {
  message: ChatUIMessage;
  bookTitle: string;
  streaming: boolean;
  onCite: (spineHref: string) => void;
};

export function MessageView({ message, bookTitle, streaming, onCite }: Props) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

  if (message.role === "user") {
    const { passage, question } = splitPassage(text);
    return (
      <div className="ml-8 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
        {passage && (
          <blockquote className="mb-1.5 line-clamp-4 border-l-2 border-[#c9bfae] pl-2 font-serif italic text-[#4a453e]">
            {passage}
          </blockquote>
        )}
        {question}
      </div>
    );
  }

  const sources = message.parts.flatMap((p) => (p.type === "data-citations" ? p.data : []));
  const byN = new Map(sources.map((s) => [s.n, s]));
  // Only sources the answer actually cites (live while streaming).
  const cited = citedNumbers(text).flatMap((n) => (byN.has(n) ? [byN.get(n)!] : []));
  // Web pages it cites (from a web search), marked a, b, c… in the text.
  const web = webCitations(text);
  // What the searches returned about each page (title, author, date), for "Cite".
  const webPages = message.parts.flatMap((p) => (p.type === "data-web-sources" ? p.data : []));
  // Until the answer starts, and while it searches the web, the thread's
  // status line says what is happening instead.
  const cursor = streaming && hasText(message) && !isSearchingWeb(message);

  return (
    <div className="group grid gap-2">
      <div className="font-serif text-[0.95rem] leading-relaxed whitespace-pre-wrap">
        <AnswerText pieces={web.pieces} byN={byN} onCite={onCite} />
        {cursor && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/40 align-middle" />}
      </div>
      {!streaming && cited.length + web.sources.length > 0 && (
        <CitationChips citations={cited} webSources={web.sources} webPages={webPages} bookTitle={bookTitle} onCite={onCite} />
      )}
      {!streaming && text && <CopyReply text={text} />}
    </div>
  );
}

/**
 * Copies the reply as written (Markdown marks and web addresses included).
 * With a mouse it shows only while the pointer is over the reply; on a
 * touch screen, where there is no hover, it stays, small and faint.
 */
function CopyReply({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyText(text))) toast.error("Couldn’t copy this reply.");
      }}
      aria-label="Copy reply"
      title="Copy reply"
      className="-my-1 -ml-1 grid size-6 place-items-center justify-self-start rounded text-[#8c8478] opacity-60 transition-opacity hover:bg-black/5 hover:text-[#1f1d1a] focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
    >
      <CopyIcon className="size-3.5" />
    </button>
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

const MARK = "ml-0.5 font-sans text-[0.7rem]";

/**
 * Renders the answer with [n] markers as small links to the cited passage,
 * and web citations as footnote letters linking to the page (the chips under
 * the answer name each page).
 */
function AnswerText({
  pieces,
  byN,
  onCite,
}: {
  pieces: CitedPiece[];
  byN: Map<number, Citation>;
  onCite: (spineHref: string) => void;
}) {
  // Consecutive web marks share one superscript: "ᵃ,ᵇ".
  const runs: (string | { mark: string; href: string }[])[] = [];
  for (const piece of pieces) {
    const prev = runs.at(-1);
    if (typeof piece === "string") runs.push(piece);
    else if (Array.isArray(prev)) prev.push(piece);
    else runs.push([piece]);
  }
  return (
    <>
      {runs.map((run, i) =>
        typeof run === "string" ? (
          <BookText key={i} text={run} byN={byN} onCite={onCite} />
        ) : (
          <sup key={i} className={MARK}>
            {run.map((web, j) => (
              <Fragment key={j}>
                {j > 0 && ","}
                <a href={web.href} target="_blank" rel="noopener noreferrer" title={web.href} className="text-primary italic underline-offset-2 hover:underline">
                  {web.mark}
                </a>
              </Fragment>
            ))}
          </sup>
        ),
      )}
    </>
  );
}

function BookText({ text, byN, onCite }: { text: string; byN: Map<number, Citation>; onCite: (spineHref: string) => void }) {
  const pieces = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return (
    <>
      {pieces.map((piece, i) => {
        const marker = piece.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
        if (!marker) return <Emphasis key={i} text={piece} />;
        return (
          <sup key={i} className={MARK}>
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
