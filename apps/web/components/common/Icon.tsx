import type { ReactNode } from "react";

export type IconName =
  | "shield"
  | "grid"
  | "box"
  | "history"
  | "arrow"
  | "check"
  | "cross"
  | "clock"
  | "chain"
  | "refresh"
  | "spark";

type IconProps = {
  name: IconName;
  size?: number;
};

export default function Icon({
  name,
  size = 20,
}: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    shield: (
      <>
        <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-4.6" />
      </>
    ),

    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5" />
      </>
    ),

    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2" />
      </>
    ),

    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    cross: <path d="m6 6 12 12M6 18 18 6" />,

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),

    chain: (
      <>
        <path
          d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
          transform="translate(1 0) scale(.9 1)"
        />
      </>
    ),

    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
      </>
    ),

    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}