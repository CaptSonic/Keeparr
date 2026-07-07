'use client';

const SHORTCUTS: [string, string][] = [
  ['?', 'Show / hide this overlay'],
  ['/', 'Focus search'],
  ['Enter / Space', 'Toggle keep on the focused card'],
  ['Esc', 'Close dialogs and menus'],
];

/** The `?` keyboard-shortcuts cheat sheet (Servarr-style). */
export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-80 rounded-lg border border-slate-700 bg-panel p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="space-y-2 text-sm">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-3">
              <kbd className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs">
                {key}
              </kbd>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
