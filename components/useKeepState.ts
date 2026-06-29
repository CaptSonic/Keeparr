'use client';

import { useState } from 'react';

/**
 * Per-user keep / "don't care" / "OK to delete" state for one title, with
 * optimistic updates and revert-on-failure. The three are mutually exclusive
 * (setting one clears the others, matching the server). "OK to delete" is only
 * offered on items the user requested on Seerr — the caller gates the control;
 * the hook just owns the mutation. Shared by MediaCard (grid) and MediaRow (list)
 * so the logic lives in exactly one place.
 */
export interface KeepState {
  keptByMe: boolean;
  skipped: boolean;
  markedForDelete: boolean;
  busy: boolean;
  skipBusy: boolean;
  deleteBusy: boolean;
  toggleKeep: () => Promise<void>;
  toggleSkip: () => Promise<void>;
  toggleDelete: () => Promise<void>;
}

export function useKeepState(opts: {
  ratingKey: string;
  initialKeptByMe?: boolean;
  initialSkipped?: boolean;
  initialMarkedForDelete?: boolean;
  onKeptChange?: (ratingKey: string, kept: boolean) => void;
  onSkipChange?: (ratingKey: string, skipped: boolean) => void;
  onDeleteChange?: (ratingKey: string, markedForDelete: boolean) => void;
}): KeepState {
  const { ratingKey, onKeptChange, onSkipChange, onDeleteChange } = opts;
  const [keptByMe, setKeptByMe] = useState(!!opts.initialKeptByMe);
  const [skipped, setSkipped] = useState(!!opts.initialSkipped);
  const [markedForDelete, setMarkedForDelete] = useState(
    !!opts.initialMarkedForDelete
  );
  const [busy, setBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function toggleKeep() {
    if (busy) return;
    const next = !keptByMe;
    setKeptByMe(next); // optimistic
    if (next) {
      setSkipped(false);
      setMarkedForDelete(false);
    }
    setBusy(true);
    try {
      const res = await fetch('/api/keep', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      if (!res.ok) throw new Error('failed');
      onKeptChange?.(ratingKey, next);
      if (next) {
        onSkipChange?.(ratingKey, false);
        onDeleteChange?.(ratingKey, false);
      }
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
    if (next) {
      setKeptByMe(false);
      setMarkedForDelete(false);
    }
    setSkipBusy(true);
    try {
      const res = await fetch('/api/skip', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      if (!res.ok) throw new Error('failed');
      onSkipChange?.(ratingKey, next);
      if (next) {
        onKeptChange?.(ratingKey, false);
        onDeleteChange?.(ratingKey, false);
      }
    } catch {
      setSkipped(!next); // revert
    } finally {
      setSkipBusy(false);
    }
  }

  async function toggleDelete() {
    if (deleteBusy) return;
    const next = !markedForDelete;
    setMarkedForDelete(next); // optimistic
    if (next) {
      setKeptByMe(false);
      setSkipped(false);
    }
    setDeleteBusy(true);
    try {
      const res = await fetch('/api/mark-delete', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingKey }),
      });
      if (!res.ok) throw new Error('failed');
      onDeleteChange?.(ratingKey, next);
      if (next) {
        onKeptChange?.(ratingKey, false);
        onSkipChange?.(ratingKey, false);
      }
    } catch {
      setMarkedForDelete(!next); // revert
    } finally {
      setDeleteBusy(false);
    }
  }

  return {
    keptByMe,
    skipped,
    markedForDelete,
    busy,
    skipBusy,
    deleteBusy,
    toggleKeep,
    toggleSkip,
    toggleDelete,
  };
}
