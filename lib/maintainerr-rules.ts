/** Shared, browser-safe configuration for the two automatic watch rules. */
export interface MaintainerrKindRules {
  requesterEnabled: boolean;
  requesterDays: number;
  globalEnabled: boolean;
  globalDays: number;
  observationDays: number;
}

export type MaintainerrAutomaticRules = Record<'movie' | 'show', MaintainerrKindRules>;

export function defaultMaintainerrRules(observationDays = 30): MaintainerrAutomaticRules {
  const defaults: MaintainerrKindRules = {
    requesterEnabled: true, requesterDays: 180,
    globalEnabled: true, globalDays: 540, observationDays,
  };
  return { movie: { ...defaults }, show: { ...defaults } };
}

/** Merge partial API updates, but never silently accept malformed rule fields. */
export function mergeMaintainerrRules(
  value: unknown,
  current: MaintainerrAutomaticRules
): MaintainerrAutomaticRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Maintainerr automatic rules.');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'movie' && key !== 'show')) {
    throw new Error('Invalid Maintainerr automatic rules.');
  }
  const next = { movie: { ...current.movie }, show: { ...current.show } };
  for (const kind of ['movie', 'show'] as const) {
    if (!(kind in input)) continue;
    const fields = input[kind];
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new Error('Invalid Maintainerr automatic rules.');
    }
    for (const [key, field] of Object.entries(fields)) {
      if (key === 'requesterEnabled' || key === 'globalEnabled') {
        if (typeof field !== 'boolean') throw new Error('Invalid Maintainerr automatic rules.');
        next[kind][key] = field;
      } else if (key === 'requesterDays' || key === 'globalDays' || key === 'observationDays') {
        const max = key === 'observationDays' ? 365 : 3650;
        if (typeof field !== 'number' || !Number.isInteger(field) || field < 1 || field > max) {
          throw new Error('Invalid Maintainerr automatic rules.');
        }
        next[kind][key] = field;
      } else {
        throw new Error('Invalid Maintainerr automatic rules.');
      }
    }
  }
  return next;
}