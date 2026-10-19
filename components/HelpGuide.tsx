'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { filterHelpFaqs, helpContent, type DemoChoice } from '@/lib/help-content';
import { useLocale } from './LocaleProvider';
import NavIcon from './NavIcon';

const panel = 'rounded-lg border border-slate-800 bg-panel';
const primary = 'inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brand-light';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-brand hover:text-brand';
const choices: DemoChoice[] = ['keep', 'skip', 'release'];

export default function HelpGuide() {
  const { locale } = useLocale();
  const c = helpContent[locale];
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<DemoChoice | null>(null);
  const [complete, setComplete] = useState(false);
  const [query, setQuery] = useState('');
  const tutorialHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const faqs = filterHelpFaqs(locale, query);

  function goToStep(index: number) {
    setStep(index);
    setComplete(false);
    tutorialHeading.current?.focus({ preventScroll: true });
  }

  function restart() {
    setChoice(null);
    goToStep(0);
  }

  const topics = [
    { id: 'quick-start', label: c.tutorial },
    { id: 'basics', label: c.basicsTitle },
    { id: 'seasons', label: c.seasonsTitle },
    { id: 'gates', label: c.gatesTitle },
    { id: 'questions', label: c.faqTitle },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-3 py-4 sm:px-6 sm:py-6">
      <section aria-labelledby="help-title" className={`${panel} relative overflow-hidden p-5 sm:p-8`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-brand/10 to-transparent" />
        <div className="relative max-w-3xl">
          <span className="mb-4 inline-flex items-center gap-2 rounded-md bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">
            <NavIcon name="help" />{c.eyebrow}
          </span>
          <h1 id="help-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.title}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{c.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#quick-start" className={primary}><NavIcon name="keep" />{c.start}</a>
            <Link href="/library" className={secondary}><NavIcon name="library" />{c.browse}</Link>
          </div>
        </div>
      </section>

      <nav aria-label={c.contents} className="flex flex-wrap gap-2">
        {topics.map(({ id, label }) => <a key={id} href={`#${id}`} className="rounded-md border border-slate-800 bg-panel px-3 py-2 text-sm text-slate-400 hover:border-brand hover:text-brand">{label}</a>)}
      </nav>

      <section id="quick-start" aria-labelledby="tutorial-title" className="scroll-mt-6">
        <h2 id="tutorial-title" className="text-xl font-semibold">{c.tutorial}</h2>
        <p className="mt-2 text-sm text-slate-400">{c.tutorialIntro}</p>
        <div className={`${panel} mt-4 overflow-hidden`}>
          <ol aria-label={c.tutorial} className="grid grid-cols-2 gap-2 border-b border-slate-800 p-3 sm:grid-cols-4 sm:p-4">
            {c.steps.map((item, index) => (
              <li key={item.title}>
                <button type="button" onClick={() => goToStep(index)} aria-current={step === index ? 'step' : undefined}
                  className={`flex h-full w-full items-center gap-2 rounded-md p-2 text-left text-sm ${step === index ? 'bg-brand/10 font-semibold text-brand' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}>
                  <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${step === index ? 'border-brand' : 'border-slate-700'}`}>{index + 1}</span>
                  <span>{item.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:gap-8">
            <div className="flex flex-col items-start">
              <p className="text-xs font-medium text-brand">{c.step} {step + 1} / {c.steps.length}</p>
              <h3 ref={tutorialHeading} tabIndex={-1} className="mt-3 rounded text-xl font-semibold">{c.steps[step].title}</h3>
              <p className="mt-3 leading-relaxed text-slate-400">{c.steps[step].text}</p>
              {c.steps[step].actionHref.startsWith('#')
                ? <a href={c.steps[step].actionHref} className="mt-4 inline-flex items-center gap-2 rounded text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-light"><NavIcon name="help" />{c.steps[step].action}<span aria-hidden="true">→</span></a>
                : <Link href={c.steps[step].actionHref} className="mt-4 inline-flex items-center gap-2 rounded text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-light"><NavIcon name="library" />{c.steps[step].action}<span aria-hidden="true">→</span></Link>}
              {complete && <p role="status" className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-slate-200">{c.done}</p>}
              <div className="mt-auto flex w-full flex-wrap gap-2 pt-6">
                <button type="button" onClick={() => goToStep(step - 1)} disabled={step === 0} className={`${secondary} disabled:cursor-not-allowed disabled:opacity-40`}>{c.previous}</button>
                {step < c.steps.length - 1
                  ? <button type="button" onClick={() => goToStep(step + 1)} className={primary}>{c.next}<span aria-hidden="true">→</span></button>
                  : complete
                    ? <Link href="/" className={primary}><NavIcon name="keep" />{locale === 'de' ? 'Jetzt Titel auswählen' : 'Choose titles now'}</Link>
                    : <button type="button" onClick={() => setComplete(true)} className={primary}>{c.finish}</button>}
                <button type="button" onClick={restart} className="rounded-md px-3 py-2 text-sm text-slate-500 hover:text-brand">{c.restart}</button>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-700 bg-app p-4 sm:p-5">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><NavIcon name="help" />{c.demo}</p>
              <div className="mt-4 flex items-center gap-4">
                <div aria-hidden="true" className={`grid h-24 w-16 shrink-0 place-items-center rounded-md border bg-brand/10 ${choice === 'keep' ? 'border-brand text-brand' : 'border-slate-700 text-slate-500'}`}><NavIcon name="keep" /></div>
                <div className="min-w-0"><h4 className="font-semibold">{c.demoTitle}</h4><p className="mt-1 text-sm text-slate-500">{c.demoHint}</p></div>
              </div>
              <div role="group" aria-label={c.demo} className="mt-4 flex flex-wrap gap-2">
                {choices.map((value) => <button key={value} id={`practice-${value}`} type="button" aria-pressed={choice === value} onClick={() => setChoice(choice === value ? null : value)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${choice === value ? value === 'release' ? 'border-rose-500 bg-rose-500/10 text-rose-400' : 'border-brand bg-brand/10 text-brand' : 'border-slate-700 text-slate-400 hover:border-brand hover:text-brand'}`}>
                  {choice === value && <span aria-hidden="true">✓ </span>}{c.choices[value]}
                </button>)}
              </div>
              <p role="status" aria-atomic="true" className="mt-4 border-t border-slate-700 pt-4 text-sm leading-relaxed text-slate-300">{c.outcomes[choice ?? 'none']}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="basics" aria-labelledby="basics-title" className="scroll-mt-6">
        <h2 id="basics-title" className="text-xl font-semibold">{c.basicsTitle}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.basics.map((item) => <article key={item.id} className={`${panel} p-5`}>
            <span className="mb-4 inline-flex rounded-md bg-brand/10 p-2.5 text-brand"><NavIcon name={item.icon} /></span>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
          </article>)}
        </div>
      </section>

      <section id="seasons" aria-labelledby="seasons-title" className="scroll-mt-6">
        <h2 id="seasons-title" className="text-xl font-semibold">{c.seasonsTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{c.seasonsIntro}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {c.seasons.map((item) => <article key={item.id} className={`${panel} p-5`}>
            <span className="mb-4 inline-flex rounded-md bg-brand/10 p-2.5 text-brand"><NavIcon name={item.icon} /></span>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
          </article>)}
        </div>
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-slate-300">{c.seasonsNote}</p>
      </section>

      <section id="gates" aria-labelledby="gates-title" className="scroll-mt-6">
        <h2 id="gates-title" className="text-xl font-semibold">{c.gatesTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{c.gatesIntro}</p>
        <div className={`${panel} mt-4 grid divide-y divide-slate-800 sm:grid-cols-2 sm:divide-y-0`}>
          {c.gates.map((item, index) => <article key={item.id} className="flex gap-3 p-5">
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-brand/30 bg-brand/10 text-sm font-semibold text-brand">{index + 1}</span>
            <div><h3 className="font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p></div>
          </article>)}
        </div>
        <p className="mt-3 border-l-2 border-brand pl-3 text-xs leading-relaxed text-slate-500">{c.gatesNote}</p>
      </section>

      <section id="questions" aria-labelledby="faq-title" className="scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="faq-title" className="text-xl font-semibold">{c.faqTitle}</h2>
          <div className="relative flex w-full items-center gap-2 sm:max-w-sm">
            <label htmlFor="help-search" className="sr-only">{c.search}</label>
            <input ref={searchInput} id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search}
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-panel px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500" />
            {query && <button type="button" aria-label={c.clear} title={c.clear} onClick={() => { setQuery(''); searchInput.current?.focus(); }} className="rounded-md border border-slate-700 px-3 py-2 text-slate-400 hover:text-brand">×</button>}
          </div>
        </div>
        <div className={`${panel} mt-4 divide-y divide-slate-800`}>
          {faqs.map(({ question, answer }) => <details key={question} className="group p-4 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-medium [&::-webkit-details-marker]:hidden">
              {question}<span aria-hidden="true" className="text-brand group-open:hidden">+</span><span aria-hidden="true" className="hidden text-brand group-open:inline">−</span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">{answer}</p>
          </details>)}
          {faqs.length === 0 && <p role="status" className="p-5 text-sm text-slate-400">{c.noResults}</p>}
        </div>
      </section>

      <section aria-labelledby="keys-title" className={`${panel} p-5`}>
        <h2 id="keys-title" className="font-semibold">{c.shortcutsTitle}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {c.shortcuts.map(({ key, text }) => <div key={key} className="flex items-start gap-3">
            <dt><kbd className="inline-block whitespace-nowrap rounded border border-slate-700 bg-app px-2 py-1 font-mono text-xs">{key}</kbd></dt>
            <dd className="pt-1 text-sm text-slate-400">{text}</dd>
          </div>)}
        </dl>
      </section>
    </div>
  );
}