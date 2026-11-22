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

/** Contents and library: three books lying in a stack, spines out, each a little
 *  offset from the one below, with a pair of bands near each end of the spine. */
export function BooksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 16.5h17v4h-17zM5.5 12.5h14v4h-14zM4.5 8.5h13v4h-13z" />
      <path d="M6 16.5v4M18 16.5v4M8 12.5v4M17 12.5v4M7 8.5v4M15 8.5v4" />
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
