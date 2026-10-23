import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { __setTestDbToMemory, __closeDb } from './db';
import { reportJobProgress, getJobProgress, finishJobProgress } from './job-progress';
import { resetInterruptedJobs } from './queries';
import { jobStates, runWithState } from './jobs';

beforeEach(() => __setTestDbToMemory());
afterAll(() => __closeDb());

describe('job progress', () => {
  it('reports unknown totals without inventing a percentage and exposes progress in job states', () => {
    reportJobProgress('watch', 'History: 2 pages', 'Verlauf: 2 Seiten', 200);
    expect(getJobProgress('watch')).toMatchObject({ completed: 200, total: null, status: 'running' });
    expect(jobStates().find((row) => row.jobId === 'watch')?.progress?.completed).toBe(200);
  });

  it('retains confirmed counts on failure and resets on the next attempt', async () => {
    await runWithState('library', async () => {
      reportJobProgress('library', 'Checking', 'Prüfen', 2, 5);
      throw new Error('offline');
    });
    expect(getJobProgress('library')).toMatchObject({ status: 'error', completed: 2, total: 5 });
    await runWithState('library', async () => {
      expect(getJobProgress('library')).toMatchObject({ status: 'running', completed: 0, total: null });
      reportJobProgress('library', 'Saved', 'Gespeichert', 5, 5);
      return { result: 5, message: 'done' };
    });
    expect(getJobProgress('library')).toMatchObject({ status: 'complete', completed: 5 });
  });

  it('marks interrupted scheduled and interactive progress as failed on restart', () => {
    reportJobProgress('maintainerr', 'Applying', 'Übergeben', 5, 8);
    reportJobProgress('watch', 'Saved', 'Gespeichert', 10, 10);
    finishJobProgress('watch', true);
    resetInterruptedJobs();
    expect(getJobProgress('maintainerr')).toMatchObject({ status: 'error', completed: 5, total: 8 });
    expect(getJobProgress('watch')?.status).toBe('complete');
  });
});