'use client';

import { useState } from 'react';

/**
 * Per-user keep / "don't care" state for one title, with optimistic updates and
 * revert-on-failure. Keep and skip are mutually exclusive (setting one clears the
 * other, matching the server). Shared by MediaCard (grid) and MediaRow (list) so
 * the mutation logic lives in exactly one place.
 */
export interface KeepState {
  keptByMe: boolean;
  skipped: boolean;
  busy: boolean;
  skipBusy: boolean;
  toggleKeep: () => Promise<void>;
  toggleSkip: () => Promise<void>;
}

export function useKeepState(opts: {
  ratingKey: string;
  initialKeptByMe?: boolean;
  initialSkipped?: boolean;
  onKeptChange?: (ratingKey: string, kept: boolean) => void;
  onSkipChange?: (ratingKey: string, skipped: boolean) => void;
}): KeepState {
  const { ratingKey, onKeptChange, onSkipChange } = opts;
  const [keptByMe, setKeptByMe] = useState(!!opts.initialKeptByMe);
  const [skipped, setSkipped] = useState(!!opts.initialSkipped);
  const [busy, setBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);

  async function toggleKeep() {
    if (busy) return;
    const next = !keptByMe;
    setKeptByMe(next); // optimistic
    if (next) setSkipped(false);
    setBusy(true);
    try {
      const res = await fetch('/api/keep', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      if (!res.ok) throw new Error('failed');
      onKeptChange?.(ratingKey, next);
      if (next) onSkipChange?.(ratingKey, false);
    } catch {
      setKeptByMe(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  async function toggleSkip() {
    if (skipBusy) return;
    const next = !skipped;
    setSkipped(next); // optimistic
    if (next) setKeptByMe(false);
    setSkipBusy(true);
    try {
      const res = await fetch('/api/skip', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      if (!res.ok) throw new Error('failed');
      onSkipChange?.(ratingKey, next);
      if (next) onKeptChange?.(ratingKey, false);
    } catch {
      setSkipped(!next); // revert
    } finally {
      setSkipBusy(false);
    }
  }

  return { keptByMe, skipped, busy, skipBusy, toggleKeep, toggleSkip };
}
