// The reader's text size: three steps, cycled by the "Aa" button and kept
// in this browser.

export const TEXT_SIZES = [
  { id: "small", scale: 0.9 },
  { id: "default", scale: 1 },
  { id: "large", scale: 1.1 },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]["id"];

const KEY = "reader:text-size";

export const textScale = (size: TextSize) => TEXT_SIZES.find((s) => s.id === size)!.scale;
/** Small → Default → Large → Small. */
export function nextTextSize(size: TextSize): TextSize {
  const i = TEXT_SIZES.findIndex((s) => s.id === size);
  return TEXT_SIZES[(i + 1) % TEXT_SIZES.length].id;
}

// Storage can be missing or throw (private windows, blocked site data); the
// size then just isn't remembered.
export function loadTextSize(): TextSize {
  try {
    const saved = localStorage.getItem(KEY);
    return TEXT_SIZES.some((s) => s.id === saved) ? (saved as TextSize) : "default";
  } catch {
    return "default";
  }
}

export function saveTextSize(size: TextSize) {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // not remembered
  }
}
