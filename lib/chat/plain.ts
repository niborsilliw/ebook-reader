import { splitEmphasis } from "./emphasis";
import { stripCitationMarkers } from "@/lib/rag/prompt";

/**
 * A reply as plain text, for copying or sharing anywhere: no emphasis marks,
 * no [n] markers for passages only the panel can open, and Markdown links
 * written out as "label (address)". Web addresses stay.
 */
export function plainReply(text: string): string {
  const unlinked = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
  return splitEmphasis(stripCitationMarkers(unlinked))
    .map((piece) => piece.text)
    .join("")
    .trim();
}
