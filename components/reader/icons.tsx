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

/** Contents: a book seen from its spine, with paired raised bands and a title label. */
export function SpineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.5h6v17H9z" />
      <path d="M9 6.5h6M9 8h6M9 16h6M9 17.5h6M11 11.5h2" />
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

/** Assistant: a typographic asterisk, the mark that points to a note. */
export function AsteriskIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 6v12M6.8 9l10.4 6M17.2 9 6.8 15" />
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
