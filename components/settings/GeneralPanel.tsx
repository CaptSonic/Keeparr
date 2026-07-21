'use client';

import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { Card, CardColumns, btnCls, btnGhost, inputCls } from './ui';
import { useLocale } from '../LocaleProvider';

export default function GeneralPanel() {
  const { locale } = useLocale();
  const de = locale === 'de';
  const [appTitle, setAppTitle] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyDirty, setKeyDirty] = useState(false); // regenerated but not saved yet
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        setAppTitle(d.appTitle ?? 'Keeparr');
        setAppUrl(d.appUrl ?? '');
        setApiKey(d.apiKey ?? '');
      })
      .catch(() => {});
  }, []);

  function generateApiKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setApiKey(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
    setKeyDirty(true);
    setShowKey(true); // a fresh key is worth seeing
  }

  async function copyApiKey() {
    if (await copyText(apiKey)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    // On failure the field stays visible for manual copy.
  }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appTitle,
          appUrl,
          ...(keyDirty ? { apiKey } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMsg(de ? 'Gespeichert.' : 'Saved.');
      // Only on success: a failed PUT means a regenerated key is NOT active,
      // so the "Save settings to activate it" warning must stay.
      setKeyDirty(false);
    } catch {
      setMsg(de ? 'Speichern fehlgeschlagen — Einstellungen unverändert.' : "Couldn't save — settings unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <CardColumns>
      <Card title={de ? 'Darstellung' : 'Branding'}>
        <label className="block text-sm text-slate-400 mb-1">{de ? 'Anwendungstitel' : 'Application title'}</label>
        <input
          className={`${inputCls} max-w-xs`}
          value={appTitle}
          onChange={(e) => setAppTitle(e.target.value)}
          placeholder="Keeparr"
        />
        <p className="mt-1 text-xs text-slate-500">{de ? 'Wird in der Seitenleiste und im Browsertab angezeigt.' : 'Shown in the sidebar and browser tab.'}</p>

        <label className="block text-sm text-slate-400 mb-1 mt-4">{de ? 'Anwendungs-URL' : 'Application URL'}</label>
        <input
          className={inputCls}
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
          placeholder="https://keeparr.example.net"
        />
        <p className="mt-1 text-xs text-slate-500">
          {de ? 'Öffentliche URL dieser App — wird für die Plex-Anmeldeweiterleitung verwendet.' : 'Public URL of this app — used to build the Plex sign-in redirect.'}
        </p>
      </Card>

      <Card title={de ? 'API-Zugriff' : 'API access'}>
        <p className="text-sm text-slate-400 mb-3">
          {de ? 'Ein Schlüssel für Automatisierung — sende ihn als ' : 'A key for automation — send it as the '}<code>X-Api-Key</code>{de ? '-Header, um Statistiken zu lesen oder Aktualisierungsjobs ohne Anmeldung zu starten.' : ' header to read stats or trigger refresh jobs without signing in.'}
        </p>
        {apiKey ? (
          <div className="flex items-center gap-2">
            <input
              className={`${inputCls} font-mono text-xs`}
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              className={`${btnGhost} shrink-0`}
              type="button"
              title={showKey ? (de ? 'Ausblenden' : 'Hide') : (de ? 'Anzeigen' : 'Show')}
            >
              {showKey ? (de ? 'Ausblenden' : 'Hide') : (de ? 'Anzeigen' : 'Show')}
            </button>
            <button
              onClick={copyApiKey}
              className={`${btnGhost} shrink-0`}
              type="button"
              title={de ? 'In Zwischenablage kopieren' : 'Copy to clipboard'}
            >
              {copied ? (de ? 'Kopiert ✓' : 'Copied ✓') : (de ? 'Kopieren' : 'Copy')}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{de ? 'Kein Schlüssel festgelegt.' : 'No key set.'}</p>
        )}
        {keyDirty && (
          <p className="mt-2 text-xs text-amber-400">
            {de ? 'Neuer Schlüssel — speichere die Einstellungen, um ihn zu aktivieren (der alte Schlüssel funktioniert dann nicht mehr).' : 'New key — Save settings to activate it (the old key stops working).'}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={generateApiKey} className={btnGhost} type="button">
            {apiKey ? (de ? 'Neu erzeugen' : 'Regenerate') : (de ? 'Schlüssel erzeugen' : 'Generate key')}
          </button>
          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-slate-400 underline hover:text-white"
          >
            {de ? 'API-Dokumentation →' : 'API docs →'}
          </a>
        </div>
      </Card>
      </CardColumns>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnCls}>
          {saving ? (de ? 'Speichern…' : 'Saving…') : (de ? 'Einstellungen speichern' : 'Save settings')}
        </button>
        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>
    </div>
  );
}
