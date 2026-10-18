import type { MaintainerrPreview } from './maintainerr';

/** A deliberately narrow display DTO: no approvals, hashes, names or watch times. */
export interface ItemDecision {
  ratingKey: string;
  kept: boolean;
  keptByMe: boolean;
  checkedAt: number;
  maintainerr: null | {
    generatedAt: number;
    paused: boolean;
    massBlocked: boolean;
    watchReady: boolean;
    automaticRules: MaintainerrPreview['automaticRules'];
    items: Array<Pick<MaintainerrPreview['items'][number],
      'status' | 'reason' | 'libraryKind' | 'dueAt' | 'collectionId' | 'collectionTitle'>>;
  };
}

export function projectItemDecision(
  ratingKey: string,
  kept: boolean,
  keptByMe: boolean,
  preview: MaintainerrPreview | null,
  checkedAt = Math.floor(Date.now() / 1000),
): ItemDecision {
  return {
    ratingKey, kept, keptByMe, checkedAt,
    maintainerr: preview ? {
      generatedAt: preview.generatedAt,
      paused: preview.paused,
      massBlocked: preview.massBlocked,
      watchReady: preview.watchReady,
      automaticRules: preview.automaticRules,
      items: preview.items.filter((item) => item.ratingKey === ratingKey).map((item) => ({
        status: item.status, reason: item.reason, libraryKind: item.libraryKind,
        dueAt: item.dueAt, collectionId: item.collectionId, collectionTitle: item.collectionTitle,
      })),
    } : null,
  };
}