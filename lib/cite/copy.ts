import { toast } from "sonner";
import { downloadBib, type BibEntry } from "./bibtex";
import type { Strings } from "@/lib/i18n/strings";

type Words = Pick<Strings, "copied" | "bibCopied" | "bibDownloaded">;

/**
 * Puts text on the clipboard and says so. Call it straight from the click:
 * Safari only allows clipboard writes during the user's gesture. Resolves
 * false where the clipboard isn't available (an insecure origin, a refused
 * permission, an older browser).
 */
export async function copyText(text: string, done: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hands text to the system share sheet (Notes, Obsidian, Workflowy, Mail…).
 * Where there is none, or it fails, the text is copied instead. Call it
 * straight from the click, as both need the user's gesture. Resolves false
 * only when neither worked; a share the reader cancels counts as done.
 */
export async function shareText(text: string, done: string, title?: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(title ? { title, text } : { text });
      return true;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return true;
    }
  }
  return copyText(text, done);
}

/**
 * Puts a citation on the clipboard, ready to paste into a reference
 * manager or a .bib file; where that fails it is downloaded as a .bib file.
 */
export async function copyBib(entry: BibEntry, t: Words) {
  if (await copyText(entry.bibtex, t.bibCopied)) return;
  downloadBib(entry);
  toast(t.bibDownloaded(`${entry.key}.bib`));
}
