/**
 * Text the reader selected or tapped in the book, sent with their next
 * message. It travels inside the message itself, as a quoted block before
 * the question, so the saved conversation (and the history the model sees on
 * later turns) keeps it without a column of its own.
 */
export const PASSAGE_MAX_CHARS = 1500;

const QUOTE = /^((?:> ?.*\n?)+)\n([\s\S]+)$/;

/** The message to send: the passage as a quoted block, then the question. */
export function withPassage(passage: string | null | undefined, question: string): string {
  const q = question.trim();
  const p = clip(passage?.replace(/\s+/g, " ").trim() ?? "");
  return p ? `> ${p}\n\n${q}` : q;
}

/** Splits a message made by withPassage back into its passage and question. */
export function splitPassage(message: string): { passage: string | null; question: string } {
  const m = message.trim().match(QUOTE);
  if (!m || !m[2].trim()) return { passage: null, question: message.trim() };
  const passage = m[1]
    .split("\n")
    .map((line) => line.replace(/^> ?/, ""))
    .join(" ")
    .trim();
  return { passage: passage || null, question: m[2].trim() };
}

function clip(text: string) {
  return text.length <= PASSAGE_MAX_CHARS ? text : `${text.slice(0, PASSAGE_MAX_CHARS - 1).trimEnd()}…`;
}

const QUICK_MAX_WORDS = 12;
// "What does this mean?", "what does 'bier' mean", "meaning of …",
// "define …", "translate this", "what's a bier?", "what is this word?"
const QUICK_PATTERNS = [
  /\bwhat\s+(?:does|do|did)\b.*\bmean\b/i,
  /\bwhat(?:'s|’s|\s+is)\s+(?:the\s+)?meaning\b/i,
  /^(?:meaning|definition)\s+of\b/i,
  /^(?:define|translate|gloss)\b/i,
  /^what(?:'s|’s|\s+is|\s+are)\s+(?:an?\s+)?["'‘“]?[\w-]+["'’”]?\s*\??$/i,
  /^what(?:'s|’s|\s+is)\s+(?:this|that)\s+(?:word|phrase|term)\b/i,
  /\bin\s+(?:plain\s+)?english\b/i,
  /^(?:what|meaning)\s*\??$/i,
];

/**
 * A short question about what a word, phrase or line says: it wants a direct
 * answer in a sentence or two, not a reading of the book.
 */
export function isQuickQuestion(question: string): boolean {
  const q = question.trim();
  if (!q || q.split(/\s+/).length > QUICK_MAX_WORDS) return false;
  return QUICK_PATTERNS.some((p) => p.test(q));
}
