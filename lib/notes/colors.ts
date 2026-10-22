// The highlight colours allowed by highlights.color (0002_notes.sql).
export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", fill: "#f5d76e" },
  { id: "green", label: "Green", fill: "#a9d8a0" },
  { id: "blue", label: "Blue", fill: "#a3c9f1" },
  { id: "pink", label: "Pink", fill: "#f4a9c4" },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]["id"];

export function colorFill(color: string): string {
  return HIGHLIGHT_COLORS.find((c) => c.id === color)?.fill ?? HIGHLIGHT_COLORS[0].fill;
}
