import type { ReactNode } from 'react';

/** Small, consistent navigation glyphs; no font or icon package required. */
export type NavIconName = 'keep' | 'library' | 'reclaim' | 'campaigns' | 'stats' | 'settings';

const paths: Record<NavIconName, ReactNode> = {
  keep: <><path d="M6 4h12v17l-6-4-6 4z" /><path d="m9 9 2 2 4-4" /></>,
  library: <><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /><path d="M3 8h7m4 0h7" /></>,
  reclaim: <><path d="M5 7a8 8 0 0 1 13-1l2 2M20 3v5h-5M19 17a8 8 0 0 1-13 1l-2-2M4 21v-5h5" /></>,
  campaigns: <><path d="M5 21V4m0 0c5-3 9 3 14 0v10c-5 3-9-3-14 0" /></>,
  stats: <><path d="M4 3v17h17M9 16v-5m5 5V7m5 9V4" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
};

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {paths[name]}
    </svg>
  );
}