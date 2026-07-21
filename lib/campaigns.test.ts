import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __closeDb, __setTestDbToMemory } from './db';
import {
  addDelete,
  addKeep,
  closeCleanupCampaign,
  createCleanupCampaign,
  getCleanupCampaignDetail,
  removeCleanupCampaignReview,
  reviewCleanupCampaignItem,
  upsertMediaBatch,
  type UpsertMediaInput,
} from './queries';

const GB = 1024 ** 3;
const item = (ratingKey: string, sizeBytes: number): UpsertMediaInput => ({
  ratingKey, sectionId: '1', libraryKind: 'movie', title: `Title ${ratingKey}`,
  year: 2020, thumb: null, sizeBytes, addedAt: 1, guidTmdb: null, guidTvdb: null,
});

beforeEach(() => {
  vi.useRealTimers();
  __setTestDbToMemory();
});
afterAll(() => __closeDb());

describe('Cleanup Campaigns', () => {
  it('snapshots deterministic candidates while global keeps remain live vetoes', () => {
    const base = Math.floor(Date.now() / 1000);
    upsertMediaBatch([item('large', 100 * GB), item('released', 20 * GB), item('kept', 200 * GB)]);
    addDelete('requester', 'released');
    addKeep('someone', 'kept');
    const campaign = createCleanupCampaign({
      name: 'Household cleanup', targetBytes: 50 * GB, deadlineAt: base + 86400,
      gracePeriodDays: 7, minScore: 20, createdBy: 'admin',
      watchAvailable: false, arrAvailable: false,
    });
    expect(campaign).toMatchObject({ plannedItems: 2, plannedBytes: 120 * GB });
    let detail = getCleanupCampaignDetail(campaign.id, 'member')!;
    expect(detail.items.map((x) => x.ratingKey)).toEqual(['released', 'large']);
    expect(detail.items[0]).toMatchObject({ rank: 1, score: 50 });

    // Later library metadata changes do not rewrite the snapshot.
    upsertMediaBatch([item('released', 1 * GB), item('large', 1 * GB), item('new', 500 * GB)]);
    detail = getCleanupCampaignDetail(campaign.id, 'member')!;
    expect(detail.plannedBytes).toBe(120 * GB);
    expect(detail.items.map((x) => x.ratingKey)).toEqual(['released', 'large']);

    expect(reviewCleanupCampaignItem(campaign.id, 'released', 'member')).toBe(true);
    expect(getCleanupCampaignDetail(campaign.id, 'member')).toMatchObject({
      reviewedBytes: 20 * GB, releasedBytes: 20 * GB,
    });
    addKeep('other', 'released');
    const protectedDetail = getCleanupCampaignDetail(campaign.id, 'member')!;
    expect(protectedDetail).toMatchObject({ releasedBytes: 0, protectedBytes: 20 * GB });
    expect(protectedDetail.items[0].outcome).toBe('protected');
  });

  it('keeps reviews per member, supports undo, and rejects unknown snapshot items', () => {
    const base = Math.floor(Date.now() / 1000);
    upsertMediaBatch([item('one', 10 * GB)]);
    const c = createCleanupCampaign({
      name: 'Review', targetBytes: GB, deadlineAt: base + 100,
      gracePeriodDays: 0, minScore: 0, createdBy: 'admin',
      watchAvailable: false, arrAvailable: false,
    });
    expect(reviewCleanupCampaignItem(c.id, 'missing', 'a')).toBe(false);
    expect(reviewCleanupCampaignItem(c.id, 'one', 'a')).toBe(true);
    expect(reviewCleanupCampaignItem(c.id, 'one', 'b')).toBe(true);
    expect(getCleanupCampaignDetail(c.id, 'a')!.items[0].reviewCount).toBe(2);
    expect(removeCleanupCampaignReview(c.id, 'one', 'a')).toBe(true);
    expect(getCleanupCampaignDetail(c.id, 'a')!.items[0]).toMatchObject({ reviewCount: 1, reviewedByMe: false });
  });

  it('stops reviews at the deadline and only closes after the grace period', () => {
    const start = new Date('2026-07-21T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const base = Math.floor(start.getTime() / 1000);
    upsertMediaBatch([item('one', 10 * GB)]);
    const c = createCleanupCampaign({
      name: 'Timed', targetBytes: GB, deadlineAt: base + 100,
      gracePeriodDays: 1, minScore: 0, createdBy: 'admin',
      watchAvailable: false, arrAvailable: false,
    });
    expect(closeCleanupCampaign(c.id)).toBe(false);
    vi.setSystemTime((base + 101) * 1000);
    expect(reviewCleanupCampaignItem(c.id, 'one', 'member')).toBe(false);
    expect(closeCleanupCampaign(c.id)).toBe(false);
    vi.setSystemTime((base + 100 + 86400) * 1000);
    expect(closeCleanupCampaign(c.id)).toBe(true);
    expect(getCleanupCampaignDetail(c.id, 'member')!.status).toBe('closed');
  });
});