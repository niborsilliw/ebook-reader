/**
 * An identifier as ISBN digits (10 or 13, final X allowed), or null if it
 * isn't one. Books mark it opf:scheme="ISBN", or "urn:isbn:…", or just give
 * the number; the checksum keeps other identifiers (UUIDs, catalogue
 * numbers) out.
 */
export function toIsbn(identifier: string | null | undefined): string | null {
  const s = identifier
    ?.trim()
    .replace(/^urn:isbn:/i, "")
    .replace(/^isbn:?\s*/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  return s && isValidIsbn(s) ? s : null;
}

function isValidIsbn(s: string) {
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  return false;
}
