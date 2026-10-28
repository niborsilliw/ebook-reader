import { toast } from "sonner";
import { downloadBib, type BibEntry } from "./bibtex";

/**
 * Puts a citation on the clipboard, ready to paste into a reference
 * manager or a .bib file. Where the clipboard isn't available (an insecure
 * origin, a refused permission, an older browser) it is downloaded as a
 * .bib file instead. Call it straight from the click: Safari only allows
 * clipboard writes during the user's gesture.
 */
export async function copyBib(entry: BibEntry) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(entry.bibtex);
    toast.success("BibTeX copied to clipboard");
  } catch {
    downloadBib(entry);
    toast(`Couldn’t copy, so it was downloaded as ${entry.key}.bib`);
  }
}
