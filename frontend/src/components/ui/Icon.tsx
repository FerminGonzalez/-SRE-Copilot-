/**
 * Iconos SVG en línea (sin dependencias externas).
 * Todos heredan `currentColor` y se dibujan con trazo de 1.75.
 */

export type IconName =
  | "pulse"
  | "list"
  | "activity"
  | "clipboard"
  | "refresh"
  | "search"
  | "play"
  | "stop"
  | "alert"
  | "check"
  | "cross"
  | "info"
  | "chevron"
  | "clock"
  | "external"
  | "commit"
  | "terminal"
  | "database"
  | "shield"
  | "file"
  | "server"
  | "inbox"
  | "send"
  | "flask"
  | "user"
  | "link";

const PATHS: Record<IconName, string[]> = {
  pulse: ["M3 12h4l3 8 4-16 3 8h4"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  clipboard: [
    "M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3",
    "M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z",
    "M9 12h6",
    "M9 16h4",
  ],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 4v5h-5"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.35-4.35"],
  play: ["M6 4l14 8-14 8z"],
  stop: ["M6 6h12v12H6z"],
  alert: [
    "M12 9v4",
    "M12 17h.01",
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  ],
  check: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "M22 4 12 14.01l-3-3"],
  cross: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M15 9l-6 6",
    "M9 9l6 6",
  ],
  info: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M12 16v-4",
    "M12 8h.01",
  ],
  chevron: ["M9 18l6-6-6-6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  external: [
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    "M15 3h6v6",
    "M10 14 21 3",
  ],
  commit: [
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M3.5 12H8",
    "M16 12h4.5",
  ],
  terminal: ["M4 17l6-6-6-6", "M12 19h8"],
  database: [
    "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z",
    "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3",
    "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
  ],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  file: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M7.5 7h.01", "M7.5 17h.01"],
  inbox: [
    "M22 12h-6l-2 3h-4l-2-3H2",
    "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  ],
  send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  flask: [
    "M9 2v6.5L3.5 18A2 2 0 0 0 5.2 21h13.6a2 2 0 0 0 1.7-3L15 8.5V2",
    "M8 2h8",
    "M6.5 15h11",
  ],
  user: [
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Para iconos decorativos: los oculta a los lectores de pantalla. */
  decorative?: boolean;
}

export function Icon({ name, size = 16, className, decorative = true }: IconProps) {
  const paths = PATHS[name] ?? [];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
