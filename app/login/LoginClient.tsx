'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MediaServerType } from '@/lib/settings';
import LanguageMenu from '@/components/LanguageMenu';
import { useLocale } from '@/components/LocaleProvider';
import { interpolate } from '@/lib/i18n';

type Step = 'choose' | 'connect' | 'login';
type Phase = 'idle' | 'waiting' | 'denied' | 'error';

const LABEL: Record<MediaServerType, string> = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
};

export default function LoginClient({
  type,
  chooserNeeded,
  configured,
  serverName,
}: {
  type: MediaServerType;
  chooserNeeded: boolean;
  configured: boolean;
  serverName: string;
}) {
  const { messages: m } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [chosen, setChosen] = useState<MediaServerType>(type);
  const [step, setStep] = useState<Step>(
    chooserNeeded ? 'choose' : type === 'plex' ? 'login' : 'login'
  );

  function goAfterAuth(needsSetup: boolean) {
    router.push(needsSetup ? '/admin/settings' : next);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-5 flex justify-end"><LanguageMenu compact /></div>
        <h1 className="text-4xl font-bold text-brand mb-2">Keeparr</h1>

        {step === 'choose' && (
          <ChooseServer
            onPlex={async () => {
              await fetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'plex' }),
              }).catch(() => {});
              setChosen('plex');
              setStep('login');
            }}
            onPick={(t) => {
              setChosen(t);
              setStep('connect');
            }}
          />
        )}

        {step === 'connect' && (
          <ConnectServer
            kind={chosen as 'jellyfin' | 'emby'}
            onConnected={() => setStep('login')}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'login' &&
          (chosen === 'plex' ? (
            <PlexLogin onAuthorized={goAfterAuth} />
          ) : (
            <CredentialsLogin
              kind={chosen as 'jellyfin' | 'emby'}
              serverName={serverName}
              onAuthorized={goAfterAuth}
            />
          ))}
      </div>
    </main>
  );
}

function ChooseServer({
  onPlex,
  onPick,
}: {
  onPlex: () => void;
  onPick: (t: MediaServerType) => void;
}) {
  const { messages: m } = useLocale();
  return (
    <>
      <p className="text-slate-400 mb-8">{m.login.chooseServer}</p>
      <div className="flex flex-col gap-3">
        <button
          onClick={onPlex}
          className="w-full rounded-lg bg-brand hover:bg-brand-light text-ink font-semibold py-3 transition-colors"
        >
          Plex
        </button>
        <button
          onClick={() => onPick('jellyfin')}
          className="w-full rounded-lg border border-slate-600 hover:border-slate-400 py-3 transition-colors"
        >
          Jellyfin
        </button>
        <button
          onClick={() => onPick('emby')}
          className="w-full rounded-lg border border-slate-600 hover:border-slate-400 py-3 transition-colors"
        >
          Emby
        </button>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        {m.login.chooseOnce}
      </p>
    </>
  );
}

function ConnectServer({
  kind,
  onConnected,
  onBack,
}: {
  kind: 'jellyfin' | 'emby';
  onConnected: () => void;
  onBack: () => void;
}) {
  const { messages: m } = useLocale();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kind, url }),
      });
      const d = await r.json();
      if (r.ok && d.ok) onConnected();
       else setErr(d.message || m.login.unreachable);
    } catch {
       setErr(m.login.unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="text-slate-400 mb-6">
         {interpolate(m.login.address, { server: LABEL[kind] })}
      </p>
      <input
        autoFocus
        className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm mb-3 focus:outline-none focus:border-brand"
        placeholder="http://192.168.1.10:8096"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="w-full rounded-lg bg-brand hover:bg-brand-light disabled:opacity-60 text-ink font-semibold py-3 transition-colors"
      >
         {busy ? m.login.connecting : m.common.continue}
      </button>
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
      <button
        type="button"
        onClick={onBack}
        className="mt-4 text-sm text-slate-500 hover:text-slate-300"
      >
         ← {m.common.back}
      </button>
    </form>
  );
}

function CredentialsLogin({
  kind,
  serverName,
  onAuthorized,
}: {
  kind: 'jellyfin' | 'emby';
  serverName: string;
  onAuthorized: (needsSetup: boolean) => void;
}) {
  const { messages: m } = useLocale();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (d.status === 'authorized') onAuthorized(!!d.needsSetup);
       else setErr(d.message || m.login.invalidCredentials);
    } catch {
       setErr(m.login.signInError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="text-slate-400 mb-6">
         {interpolate(m.login.signInAccount, { server: serverName || LABEL[kind] })}
      </p>
      <input
        autoFocus
        className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm mb-3 focus:outline-none focus:border-brand"
         placeholder={m.login.username}
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm mb-3 focus:outline-none focus:border-brand"
         placeholder={m.login.password}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !username}
        className="w-full rounded-lg bg-brand hover:bg-brand-light disabled:opacity-60 text-ink font-semibold py-3 transition-colors"
      >
         {busy ? m.login.signingIn : m.login.signIn}
      </button>
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
    </form>
  );
}

function PlexLogin({
  onAuthorized,
}: {
  onAuthorized: (needsSetup: boolean) => void;
}) {
  const { messages: m } = useLocale();
  const [phase, setPhase] = useState<Phase>('idle');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startLogin = useCallback(async () => {
    setPhase('waiting');
    try {
      const res = await fetch('/api/auth/plex/pin', { method: 'POST' });
      if (!res.ok) throw new Error('pin failed');
      const { id, authUrl } = await res.json();
      const popup = window.open(authUrl, 'plex-auth', 'width=600,height=700');

      stopPolling();
      pollTimer.current = setInterval(async () => {
        const r = await fetch(`/api/auth/plex/check?id=${id}`);
        const data = await r.json();
        if (data.status === 'pending') return;
        stopPolling();
        popup?.close();
        if (data.status === 'authorized') onAuthorized(!!data.needsSetup);
        else if (data.status === 'denied') setPhase('denied');
        else setPhase('error');
      }, 2000);
    } catch {
      stopPolling();
      setPhase('error');
    }
  }, [onAuthorized]);

  return (
    <>
       <p className="text-slate-400 mb-8">{m.login.plexIntro}</p>
      <button
        onClick={startLogin}
        disabled={phase === 'waiting'}
        className="w-full rounded-lg bg-brand hover:bg-brand-light disabled:opacity-60 text-ink font-semibold py-3 transition-colors"
      >
         {phase === 'waiting' ? m.login.plexWaiting : m.login.plexSignIn}
      </button>
      {phase === 'waiting' && (
        <p className="mt-4 text-sm text-slate-500">
           {m.login.plexComplete}
        </p>
      )}
      {phase === 'denied' && (
        <p className="mt-4 text-sm text-red-400">
           {m.login.plexDenied}
        </p>
      )}
      {phase === 'error' && (
        <p className="mt-4 text-sm text-red-400">
           {m.login.plexError}
        </p>
      )}
    </>
  );
}
