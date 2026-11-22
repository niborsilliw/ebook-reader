import { cn } from "@/lib/utils";

// The reader's chrome icons: hairline strokes drawn like printer's marks, so
// they sit quietly beside the serif type rather than looking like app UI.

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("size-[18px]", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Contents and library: three books on a shelf, the last leaning on its
 *  neighbour, each spine banded top and bottom like a Penguin classic. */
export function BooksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 20.5h18" />
      <path d="M4.5 5h4v15.5h-4zM8.5 3.5h4v17h-4z" />
      <path d="M4.5 8.5h4M4.5 17h4M8.5 7h4M8.5 17h4" />
      <g transform="rotate(-14 15.9 20.5)">
        <path d="M15.9 6.5h3.5v14h-3.5z" />
        <path d="M15.9 9.6h3.5M15.9 17.4h3.5" />
      </g>
    </Icon>
  );
}

/** Notes and highlights: a fountain pen nib, slit to the breather hole. */
export function NibIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21 7.5 13c-.6-1.1-.4-2.4.5-3.3L9.5 8V3.5h5V8l1.5 1.7c.9.9 1.1 2.2.5 3.3z" />
      <path d="M12 21v-7.6M9.5 6.5h5" />
      <circle cx="12" cy="12.2" r="1.1" />
    </Icon>
  );
}

/** The assistant: a dialogue, two speech bubbles answering each other, the
 *  nearer one drawn over the further. */
export function DialogueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 13H6.5l-3 2.5V5.5a1.5 1.5 0 0 1 1.5-1.5h8.5A1.5 1.5 0 0 1 15 5.5V8" />
      <path d="M10 8h8.5a1.5 1.5 0 0 1 1.5 1.5V20l-3-2.5h-7a1.5 1.5 0 0 1-1.5-1.5V9.5A1.5 1.5 0 0 1 10 8z" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 7 10 10M17 7 7 17" />
    </Icon>
  );
}

/** Copy: two leaves of paper, one over the other. */
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.5" y="8.5" width="11" height="12" rx="1" />
      <path d="M15.5 8.5V4.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3" />
    </Icon>
  );
}

/** Share: a leaf with an arrow rising out of it. */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 9.5h-2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
      <path d="M12 14.5V3.5M8.5 7 12 3.5 15.5 7" />
    </Icon>
  );
}
