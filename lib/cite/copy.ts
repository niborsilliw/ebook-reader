import { toast } from "sonner";
import { downloadBib, type BibEntry } from "./bibtex";

/**
 * Puts text on the clipboard and says so. Call it straight from the click:
 * Safari only allows clipboard writes during the user's gesture. Resolves
 * false where the clipboard isn't available (an insecure origin, a refused
 * permission, an older browser).
 */
export async function copyText(text: string, done = "Copied to clipboard.") {
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
 * Puts a citation on the clipboard, ready to paste into a reference
 * manager or a .bib file; where that fails it is downloaded as a .bib file.
 */
export async function copyBib(entry: BibEntry) {
  if (await copyText(entry.bibtex, "BibTeX copied to clipboard")) return;
  downloadBib(entry);
  toast(`Couldn’t copy, so it was downloaded as ${entry.key}.bib`);
}
