'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CleanupCampaignDetail,
  CleanupCampaignItem,
  CleanupCampaignSummary,
} from '@/lib/types';
import { formatSize } from '@/lib/format';
import { useToast } from './Toaster';
import { useKeepState } from './useKeepState';

const GB = 1024 ** 3;

export default function CleanupCampaigns() {
  const [campaigns, setCampaigns] = useState<CleanupCampaignSummary[]>([]);
  const [selected, setSelected] = useState<CleanupCampaignDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
      setIsAdmin(!!data.isAdmin);
    } catch {
      toast("Couldn't load cleanup campaigns.", 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadList(); }, [loadList]);

  async function open(id: number) {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data.campaign);
      setIsAdmin(!!data.isAdmin);
    } catch {
      toast("Couldn't load the campaign.", 'error');
    }
  }

  async function create(form: HTMLFormElement) {
    const fd = new FormData(form);
    const deadline = new Date(`${String(fd.get('deadline'))}T23:59:59`);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          targetBytes: Math.round(Number(fd.get('targetGiB')) * GB),
          deadlineAt: Math.floor(deadline.getTime() / 1000),
          gracePeriodDays: Number(fd.get('graceDays')),
          minScore: Number(fd.get('minScore')),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error);
      }
      const data = await res.json();
      toast('Cleanup campaign created from the current reclaim snapshot.', 'success');
      form.reset();
      await loadList();
      await open(data.campaign.id);
    } catch (error) {
      toast(
        error instanceof Error && error.message === 'no_campaign_candidates'
          ? 'No Smart Reclaim candidates match this minimum score.'
          : "Couldn't create the campaign. Check the target and deadline.",
        'error'
      );
    } finally {
      setCreating(false);
    }
  }

  async function closeCampaign(c: CleanupCampaignDetail) {
    try {
      const res = await fetch(`/api/admin/campaigns/${c.id}/close`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      toast('Campaign closed. Its candidate snapshot and review record are retained.', 'success');
      await loadList();
      await open(c.id);
    } catch {
      toast('The campaign can only close after its grace period.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Cleanup Campaigns</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Turn Smart Reclaim into a household review plan. Candidates are snapshotted;
          any keep remains a live veto, and Keeparr still never deletes media.
        </p>
      </header>

      {isAdmin && <CreateCampaign busy={creating} onCreate={create} />}

      <section className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Campaigns</h2>
          {campaigns.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)}
              className={`w-full rounded-lg border p-4 text-left ${selected?.id === c.id ? 'border-brand bg-brand/5' : 'border-slate-800 bg-panel hover:border-slate-600'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <Status status={c.status} />
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {formatSize(c.releasedBytes)} / {formatSize(c.targetBytes)} released
              </div>
              <Progress value={c.releasedBytes} max={c.targetBytes} />
              <div className="mt-2 text-xs text-slate-500">Deadline {date(c.deadlineAt)}</div>
            </button>
          ))}
          {!loading && campaigns.length === 0 && (
            <div className="rounded-lg border border-slate-800 p-5 text-sm text-slate-400">
              No campaigns yet. An admin can create one from the current Smart Reclaim queue.
            </div>
          )}
        </div>

        <div>
          {selected ? (
            <CampaignDetail
              campaign={selected}
              isAdmin={isAdmin}
              onChanged={(c) => { setSelected(c); loadList(); }}
              onClose={() => closeCampaign(selected)}
            />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
              Select a campaign to review its snapshot and progress.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CreateCampaign({ busy, onCreate }: { busy: boolean; onCreate: (form: HTMLFormElement) => void }) {
  const defaultDeadline = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const minimumDeadline = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  return (
    <details className="rounded-lg border border-slate-800 bg-panel p-4">
      <summary className="cursor-pointer font-semibold text-brand">Create a campaign</summary>
      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); onCreate(e.currentTarget); }}>
        <label className="text-xs text-slate-400 lg:col-span-2">Name
          <input name="name" required maxLength={100} placeholder="Summer cleanup"
            className="mt-1 w-full rounded border border-slate-700 bg-app px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-400">Target (GiB)
          <input name="targetGiB" required type="number" min="1" step="1" defaultValue="100"
            className="mt-1 w-full rounded border border-slate-700 bg-app px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-400">Review deadline
          <input name="deadline" required type="date" min={minimumDeadline} defaultValue={defaultDeadline}
            className="mt-1 w-full rounded border border-slate-700 bg-app px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-400">Grace period
          <select name="graceDays" defaultValue="7" className="mt-1 w-full rounded border border-slate-700 bg-app px-3 py-2 text-sm text-white">
            <option value="0">None</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Minimum score
          <select name="minScore" defaultValue="45" className="mt-1 w-full rounded border border-slate-700 bg-app px-3 py-2 text-sm text-white">
            <option value="0">All candidates</option><option value="45">Medium +</option><option value="70">Strong only</option>
          </select>
        </label>
        <div className="flex items-end lg:col-span-4">
          <button disabled={busy} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
            {busy ? 'Creating snapshot…' : 'Create snapshot campaign'}
          </button>
        </div>
      </form>
    </details>
  );
}

function CampaignDetail({ campaign, isAdmin, onChanged, onClose }: {
  campaign: CleanupCampaignDetail; isAdmin: boolean;
  onChanged: (c: CleanupCampaignDetail) => void; onClose: () => void;
}) {
  const now = Date.now() / 1000;
  const reviewOpen = campaign.status === 'active' && now <= campaign.deadlineAt;
  const canClose = campaign.status === 'active' && now >= campaign.graceEndsAt;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-800 bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold">{campaign.name}</h2><p className="mt-1 text-xs text-slate-500">Snapshot created {date(campaign.createdAt)} · score {campaign.minScore}+</p></div>
          <div className="flex gap-2"><Status status={campaign.status} />{isAdmin && <a href={`/api/admin/campaigns/${campaign.id}/export`} className="rounded border border-slate-700 px-3 py-1 text-xs hover:border-slate-500">Export CSV</a>}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="Planned" value={formatSize(campaign.plannedBytes)} sub={`${campaign.plannedItems} titles`} />
          <Metric label="Reviewed" value={formatSize(campaign.reviewedBytes)} sub={`${campaign.reviewedItems} titles`} />
          <Metric label="Released" value={formatSize(campaign.releasedBytes)} sub={`${campaign.releasedItems} titles`} />
          <Metric label="Protected" value={formatSize(campaign.protectedBytes)} sub={`${campaign.protectedItems} titles`} />
        </div>
        <div className="mt-4"><div className="flex justify-between text-xs text-slate-400"><span>Target progress</span><span>{formatSize(campaign.releasedBytes)} / {formatSize(campaign.targetBytes)}</span></div><Progress value={campaign.releasedBytes} max={campaign.targetBytes} /></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Review until {date(campaign.deadlineAt)} · grace ends {date(campaign.graceEndsAt)}</span>
          {isAdmin && campaign.status === 'active' && <button type="button" disabled={!canClose} onClick={onClose} title={!canClose ? 'Available after the grace period' : undefined} className="rounded border border-slate-700 px-3 py-1 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Close campaign</button>}
        </div>
        {campaign.status === 'active' && !reviewOpen && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Reviews are closed. Household keeps remain live safety vetoes while the grace period completes.
          </div>
        )}
        {campaign.status === 'closed' && (
          <div className="mt-3 rounded border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            Closed {campaign.closedAt ? date(campaign.closedAt) : ''}. The candidate snapshot is fixed; live household keeps can still protect a title.
          </div>
        )}
      </section>
      <div className="space-y-3">
        {campaign.items.map((item) => <CampaignRow key={item.ratingKey} campaignId={campaign.id} item={item} reviewOpen={reviewOpen} onChanged={onChanged} />)}
      </div>
    </div>
  );
}

function CampaignRow({ campaignId, item, reviewOpen, onChanged }: { campaignId: number; item: CleanupCampaignItem; reviewOpen: boolean; onChanged: (c: CleanupCampaignDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const keep = useKeepState({ ratingKey: item.ratingKey, initialKeptByMe: item.keptByMe, onKeptChange: async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`); if (res.ok) onChanged((await res.json()).campaign);
  }});
  async function toggleReview() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/review`, { method: item.reviewedByMe ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ratingKey: item.ratingKey }) });
      if (!res.ok) throw new Error();
      onChanged((await res.json()).campaign);
    } catch { toast("Couldn't save your campaign review.", 'error'); }
    finally { setBusy(false); }
  }
  const tone = item.outcome === 'protected' ? 'text-brand bg-brand/10' : item.outcome === 'released' ? 'text-rose-300 bg-rose-500/10' : 'text-slate-300 bg-slate-700';
  return (
    <article className="flex gap-3 rounded-lg border border-slate-800 bg-panel p-3">
      <div className="w-7 shrink-0 pt-1 text-center text-sm text-slate-500">#{item.rank}</div>
      {item.thumbUrl ? (// eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbUrl} alt="" className="h-20 w-14 shrink-0 rounded bg-slate-800 object-cover" />
      ) : <div className="grid h-20 w-14 shrink-0 place-items-center rounded bg-slate-800 text-slate-600">◇</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{item.title}{item.year ? <span className="font-normal text-slate-500"> ({item.year})</span> : null}</h3><div className="font-mono text-sm text-slate-400">{formatSize(item.sizeBytes)} · score {item.score}</div></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{item.outcome}</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5">{item.reasons.map((r) => <span key={r.code} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">{r.label} +{r.points}</span>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!reviewOpen || busy || item.protectedByAnyone} onClick={toggleReview} className={`rounded px-3 py-1.5 text-sm disabled:opacity-40 ${item.reviewedByMe ? 'border border-rose-500/50 text-rose-300' : 'bg-rose-500 text-white'}`}>{busy ? 'Saving…' : item.reviewedByMe ? 'Undo my release' : 'Release after grace'}</button>
          {!item.protectedByAnyone && <button type="button" onClick={keep.toggleKeep} disabled={keep.busy} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60">{keep.busy ? 'Saving…' : 'Protect / Keep'}</button>}
          <span className="text-xs text-slate-500">{item.reviewCount} release review{item.reviewCount === 1 ? '' : 's'}</span>
          {item.protectedByAnyone && <span className="text-xs text-brand">A household keep overrides all releases</span>}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="rounded bg-slate-900/40 p-3"><div className="text-lg font-bold text-brand">{value}</div><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></div>; }
function Status({ status }: { status: string }) { return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{status}</span>; }
function Progress({ value, max }: { value: number; max: number }) { const width = Math.min(100, max > 0 ? (value / max) * 100 : 0); return <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-brand transition-all" style={{ width: `${width}%` }} /></div>; }
function date(ts: number) { return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }