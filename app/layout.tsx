import type { Metadata, Viewport } from 'next';
import { getAppTitle } from '@/lib/settings';
import ThemeProvider from '@/components/ThemeProvider';
import LocaleProvider from '@/components/LocaleProvider';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getAppTitle(),
    description: 'Gemeinsam entscheiden, welche Medien bleiben und was Speicherplatz freigeben kann. Decide what media to keep and what can be deleted.',
    // Declaring `icons` overrides Next's file-convention auto-link for
    // app/icon.svg, so the favicon MUST be listed here explicitly or the tab
    // icon disappears.
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: '/icons/apple-touch-icon.png',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Pre-hydration theme init: reads the per-user prefs from localStorage and
 * stamps `data-theme` / `data-cim` on <html> BEFORE first paint, so there is
 * no light/dark flash. Kept dependency-free and tiny; ThemeProvider updates
 * the same attributes and browser theme color live afterwards.
 * `suppressHydrationWarning` on <html> because these attributes are
 * intentionally client-decided.
 */
const THEME_INIT = `(function(){try{
var p=localStorage.getItem('keeparr.theme');
if(p!=='light'&&p!=='dark'){p='system';}
var t=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;
var d=document.documentElement;d.setAttribute('data-theme',t);d.setAttribute('data-theme-preference',p);
if(localStorage.getItem('keeparr.colorImpaired')==='1'){d.setAttribute('data-cim','1');}
var m=document.querySelector('meta[data-keeparr-theme-color]');if(m){m.setAttribute('content',t==='light'?'#f8fafc':'#0f172a');}
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})()`;

const LOCALE_INIT = `(function(){try{var l=localStorage.getItem('keeparr.locale');if(l!=='de'&&l!=='en'){var n=(navigator.languages&&navigator.languages[0])||navigator.language||'en';l=String(n).toLowerCase().split(/[-_]/)[0]==='de'?'de':'en';}document.documentElement.lang=l;document.documentElement.setAttribute('data-locale',l);}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" data-keeparr-theme-color="1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT }} />
      </head>
      <body>
        <ThemeProvider><LocaleProvider>{children}</LocaleProvider></ThemeProvider>
      </body>
    </html>
  );
}
