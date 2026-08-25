/** One game's live transfer state, as the dashboard needs it. */
export interface ProgressEntry {
  game: string;
  phase?: string;
  message?: string;
  file?: string;
  done?: number;
  total?: number;
  bytesDone?: number;
  bytesTotal?: number;
  /** when this phase first reported, so a rate can be measured over it */
  startedAt: number;
  startBytes: number;
  at: number;
}

/**
 * Folds one progress event into the map the dashboard renders.
 *
 * A phase-less event for a game with nothing recorded yet used to dereference
 * the missing entry — `undefined === undefined` made the "same phase" test
 * true — which threw inside the state updater and blanked the window.
 */
export function foldProgress(
  state: Record<string, ProgressEntry>,
  event: { game: string; phase?: string; [k: string]: unknown },
  now = Date.now(),
): Record<string, ProgressEntry> {
  const prev = state[event.game];
  const samePhase = Boolean(prev) && prev.phase === event.phase;
  const bytesDone = typeof event.bytesDone === "number" ? event.bytesDone : 0;

  return {
    ...state,
    [event.game]: {
      ...(event as any),
      startedAt: samePhase ? prev.startedAt : now,
      startBytes: samePhase ? prev.startBytes ?? 0 : bytesDone,
      at: now,
    },
  };
}

/** Bytes per second over the current phase, or 0 until there is enough to say. */
export function rateOf(p: ProgressEntry): number {
  const secs = (p.at - p.startedAt) / 1000;
  if (secs <= 0.5) return 0;
  return Math.max(0, (p.bytesDone ?? 0) - (p.startBytes ?? 0)) / secs;
}

/** Seconds remaining, or null when it cannot be estimated yet. */
export function etaOf(p: ProgressEntry): number | null {
  const rate = rateOf(p);
  const left = p.bytesTotal ? Math.max(0, p.bytesTotal - (p.bytesDone ?? 0)) : 0;
  return rate > 0 && left > 0 ? left / rate : null;
}
