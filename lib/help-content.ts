import type { Locale } from './i18n';
import type { NavIconName } from '@/components/NavIcon';

export type DemoChoice = 'keep' | 'skip' | 'release';

interface GuideEntry {
  id: string;
  icon: NavIconName;
  title: string;
  text: string;
}

interface TutorialStep {
  title: string;
  text: string;
  action: string;
  actionHref: string;
}

interface HelpContent {
  eyebrow: string;
  title: string;
  intro: string;
  start: string;
  browse: string;
  contents: string;
  tutorial: string;
  tutorialIntro: string;
  step: string;
  previous: string;
  next: string;
  restart: string;
  finish: string;
  done: string;
  demo: string;
  demoTitle: string;
  demoHint: string;
  choices: Record<DemoChoice, string>;
  outcomes: Record<DemoChoice | 'none', string>;
  basicsTitle: string;
  basics: GuideEntry[];
  seasonsTitle: string;
  seasonsIntro: string;
  seasons: GuideEntry[];
  seasonsNote: string;
  gatesTitle: string;
  gatesIntro: string;
  gates: GuideEntry[];
  gatesNote: string;
  faqTitle: string;
  search: string;
  noResults: string;
  clear: string;
  faqs: { question: string; answer: string }[];
  shortcutsTitle: string;
  shortcuts: { key: string; text: string }[];
  steps: TutorialStep[];
}

export const helpContent: Record<Locale, HelpContent> = {
  de: {
    eyebrow: 'Dein Wegweiser',
    title: 'Du entscheidest, was bleibt.',
    intro: 'Lieblingstitel schützen, Neues entdecken und gemeinsam Platz schaffen. Hier erfährst du, wie es geht – ganz ohne technisches Vorwissen.',
    start: 'In 4 Schritten loslegen',
    browse: 'Zur Bibliothek',
    contents: 'Direkt zum Thema',
    tutorial: 'Dein Schnellstart',
    tutorialIntro: 'Erst ausprobieren, dann entscheiden. Diese Übung verändert keine echten Titel.',
    step: 'Schritt', previous: 'Zurück', next: 'Weiter', restart: 'Neu starten',
    finish: 'Übung abschließen',
    done: 'Gut vorbereitet! Du kannst jetzt echte Titel auswählen. Diese Übung lässt sich jederzeit wiederholen.',
    demo: 'Übung · keine echten Änderungen', demoTitle: 'Dein nächster Lieblingsfilm',
    demoHint: 'Probiere eine Auswahl aus. Erneutes Anklicken nimmt sie zurück.',
    choices: { keep: 'Behalten', skip: 'Ist mir egal', release: 'Kann gelöscht werden' },
    outcomes: {
      none: 'Noch unentschieden. Ohne Auswahl hast du noch keine persönliche Entscheidung getroffen.',
      keep: 'Du möchtest diesen Titel behalten. Dein Behalten schützt ihn vor der automatischen Übergabe zum Aufräumen – auch wenn andere ihn freigeben.',
      skip: 'Du brauchst diesen Titel nicht zu schützen. „Ist mir egal“ ist keine ausdrückliche Löschfreigabe und hebt den Schutz anderer nicht auf.',
      release: 'Du gibst einen selbst angefragten Titel ausdrücklich frei. Das löscht ihn nicht sofort: Schutzregeln und die Entscheidungen anderer zählen weiterhin.',
    },
    basicsTitle: 'Die wichtigsten Bereiche',
    basics: [
      { id: 'choose', icon: 'keep', title: 'Was soll bleiben?', text: 'Klicke auf eine Titelkarte, um „Behalten“ umzuschalten. Die Entscheidung wird direkt gespeichert. In „Für dich“ markiert „Auswahl speichern & weiter“ die übrigen angezeigten, nicht freigegebenen Titel als „Ist mir egal“ und lädt neue Vorschläge.' },
      { id: 'library', icon: 'library', title: 'Bibliothek & Suche', text: 'Die Bibliothek lässt sich nach Status, Größe und – falls verfügbar – Wiedergaben filtern. Weitere Filter kannst du aufklappen und zurücksetzen. Nutze die Suche oben für einen bestimmten Titel; dort wird unabhängig von deinen Bibliotheksfiltern gesucht.' },
      { id: 'reclaim', icon: 'reclaim', title: 'Speicher freigeben', text: 'Hier findest du begründete Aufräumvorschläge für Titel, die niemand behält. Eine hohe Bewertung ist nur ein Hinweis, keine Löschentscheidung. Mit „Behalten“ nimmst du einen Titel aus den Vorschlägen.' },
      { id: 'campaigns', icon: 'campaigns', title: 'Gemeinsam in Kampagnen entscheiden', text: 'In einer Aufräumkampagne prüft ihr eine festgelegte Auswahl. Du kannst Titel behalten oder im Rahmen der Kampagne freigeben. Erst nach Abschluss können geeignete Freigaben weitergegeben werden; ein aktuelles „Behalten“ schützt weiterhin.' },
      { id: 'stats', icon: 'stats', title: 'Gesamtüberblick', text: 'Sieh dir Größen, geschützte Titel und mögliche Aufräumkandidaten an. Potenziell freigebbarer Speicher ist eine Schätzung und nicht automatisch bereits verfügbarer Speicher.' },
      { id: 'appearance', icon: 'settings', title: 'So, wie es für dich passt', text: 'Über dein Konto oben rechts wechselst du Sprache, helles oder dunkles Design und den Modus für besser unterscheidbare Statusfarben. Deine Auswahlentscheidungen bleiben davon unberührt.' },
    ],
    seasonsTitle: 'Staffellöschung & Archivierung',
    seasonsIntro: 'Du möchtest vorhandene Folgen einer Serie zum Aufräumen freigeben, statt den gesamten Titel zur Entfernung freizugeben? Dafür gibt es „Vorhandene Staffeln archivieren“.',
    seasons: [
      { id: 'select', icon: 'library', title: '1. Freigabeart auswählen', text: 'Bei einer dir als eigene Anfrage zugeordneten Serie findest du an der Karte den „Freigabemodus“. Wähle „Vorhandene Staffeln archivieren“; in der Listenansicht heißt die Option „Staffeln archivieren“. Wenn noch keine Freigabe gesetzt ist, bestätige anschließend mit „Kann gelöscht werden“. Bei bereits freigegebenen Titeln wird ein Wechsel des Modus direkt gespeichert.' },
      { id: 'scope', icon: 'reclaim', title: '2. Vorhandene Dateien statt ganzer Serie', text: 'Diese Freigabe betrifft die vorhandenen Episodendateien. Du wählst dabei nicht einzelne Staffeln aus, und es werden nicht automatisch nur bereits angesehene Folgen berücksichtigt. Der genaue Umfang wird in einer Vorschau durch die Admins geprüft. Weiterlaufende Serien werden auch bei passenden automatischen Regeln in diesen gesonderten Ablauf geleitet, statt den ganzen Titel zu entfernen.' },
      { id: 'review', icon: 'keep', title: '3. Prüfung vor der Ausführung', text: 'Deine Auswahl löscht noch nichts. Ein „Behalten“ schützt die Serie weiterhin. Vor der Ausführung prüfen die Admins den konkreten Plan; die Freigabe und die Dateien werden erneut geprüft. Aktive Downloads oder fehlgeschlagene notwendige Prüfungen blockieren den Vorgang. Bei automatischen Kandidaten gelten zusätzlich die Wiedergabe- und Beobachtungsregeln.' },
      { id: 'restore', icon: 'help', title: '4. Was bleibt danach sichtbar?', text: 'Bei eingerichteter Platzhalter-Funktion können die archivierten Folgen als kleine Hinweisvideos sichtbar bleiben. Das Abspielen eines solchen Platzhalters kann eine erneute Beschaffung anstoßen; auch Admins können diese anfordern. Die echte Folge ist dadurch nicht sofort wieder verfügbar. Ohne entsprechend eingerichtete Funktion darfst du nicht davon ausgehen, dass ein Platzhalter angezeigt wird.' },
    ],
    seasonsNote: 'Wichtig: „Archivieren“ ist hier keine Sicherungskopie. Die echten Videodateien können gelöscht und durch Platzhalter ersetzt werden. Eine spätere Wiederherstellung hängt von der Einrichtung und der erneuten Verfügbarkeit ab. Vor der Ausführung kannst du deine Freigabe zurücknehmen oder „Behalten“ wählen; bereits entfernte Dateien kommen dadurch nicht automatisch zurück.',
    gatesTitle: 'Die Gates: Schutz vor automatischem Aufräumen',
    gatesIntro: 'Eine Freigabe ist kein Löschknopf. Vor der automatischen Übergabe werden mehrere Bedingungen geprüft. Welche Funktionen aktiv sind, legen die Admins fest.',
    gates: [
      { id: 'keep', icon: 'keep', title: 'Ein „Behalten“ reicht', text: 'Sobald jemand einen Titel behält, wird er nicht automatisch weitergegeben. Du kannst nur deine eigene Entscheidung zurücknehmen, nicht die anderer.' },
      { id: 'watch', icon: 'stats', title: 'Alle Wiedergaben zählen', text: 'Auch wenn die anfragende Person nicht mehr schaut: Eine kürzliche Wiedergabe durch jemand anderen schützt ebenfalls. Der Schutzzeitraum beträgt standardmäßig 180 Tage.' },
      { id: 'observe', icon: 'reclaim', title: 'Erst beobachten', text: 'Automatisch erkannte Kandidaten werden standardmäßig 30 Tage beobachtet. Ein „Behalten“ oder eine Wiedergabe, die die Regel unterbricht, setzt die betreffende Beobachtung zurück. Ausdrückliche Freigaben haben einen anderen Ablauf.' },
      { id: 'playback', icon: 'library', title: 'Aktuelle Wiedergaben prüfen', text: 'Wenn die Live-Prüfung unterstützt wird, schützen auch laufende, pausierte und ladende Wiedergaben. Bei Serien gilt dieser Schutz für die gesamte Serie.' },
      { id: 'collections', icon: 'campaigns', title: 'Sammlungen zusammen betrachten', text: 'Bei unterstützten Filmsammlungen kann ein geschütztes, ungeeignetes oder unbekanntes Mitglied die gesamte Sammlung vor der automatischen Freigabe schützen.' },
      { id: 'stop', icon: 'help', title: 'Im Zweifel pausieren', text: 'Fehlende notwendige Live-Prüfungen halten die Übergabe an. Große Änderungsmengen und unerwartete Wiederaufnahmen brauchen eine ausdrückliche Admin-Freigabe.' },
    ],
    gatesNote: '180 und 30 Tage sind anpassbare Standardwerte, keine Anzeige eurer aktuellen Einstellungen. Live-Schutz und Sammlungsschutz hängen von der Einrichtung ab. Prüfungen gelten zum Prüfzeitpunkt; eine spätere Löschung ist ein separater Vorgang.',
    faqTitle: 'Noch eine Frage?', search: 'Fragen durchsuchen …', noResults: 'Keine passende Frage gefunden. Versuche „Behalten“, „Freigabe“ oder „Filter“.', clear: 'Suche zurücksetzen',
    faqs: [
      { question: 'Was ist der Unterschied zwischen „Ist mir egal“ und einer Freigabe?', answer: '„Ist mir egal“ bedeutet, dass du keinen persönlichen Behalten-Wunsch hast. Eine Freigabe ist deine ausdrückliche Zustimmung zum Aufräumen. Beides hebt ein „Behalten“ anderer nicht auf; automatische Regeln können ungeschützte Titel unabhängig davon prüfen.' },
      { question: 'Warum sehe ich „Kann gelöscht werden“ nicht bei jedem Titel?', answer: 'Die persönliche Freigabe ist für Titel verfügbar, die dir als eigene Anfrage zugeordnet sind. In Kampagnen kannst du die dort vorgesehenen Titel ebenfalls bewerten.' },
      { question: 'Kann ich meine Meinung später ändern?', answer: 'Ja. Du kannst dein „Behalten“, „Ist mir egal“ oder deine persönliche Freigabe wieder zurücknehmen oder durch eine andere Auswahl ersetzen. Ein inzwischen bereits entfernter Titel wird dadurch nicht automatisch wiederhergestellt.' },
      { question: 'Was passiert bei „Auswahl speichern & weiter“?', answer: 'In „Für dich“ werden die übrigen sichtbaren Titel, die du weder behältst noch ausdrücklich freigegeben hast, als „Ist mir egal“ markiert. Danach bekommst du eine neue Auswahl. Dein Klick auf „Behalten“ wird bereits direkt gespeichert.' },
      { question: 'Warum ist ein freigegebener Titel noch vorhanden?', answer: 'Eine Freigabe führt nicht sofort zur Löschung. Vielleicht behält ihn jemand, er wurde kürzlich geschaut, eine Frist läuft noch oder eine notwendige Prüfung ist nicht möglich. Auch die weitere Verarbeitung benötigt Zeit.' },
      { question: 'Was bedeutet „Warum?“ an einem Titel?', answer: 'Die Erklärung zeigt dir den aktuellen Behalten-Schutz, ohne andere Nutzer namentlich zu nennen. Zusätzliche Verwaltungsinformationen können auf einem älteren Prüfstand beruhen und sind keine aktuelle Freigabe.' },
      { question: 'Was bedeutet „Vorhandene Staffeln archivieren“ bei der Staffellöschung?', answer: 'Du gibst vorhandene Episodendateien einer Serie für einen gesonderten, von Admins geprüften Ablauf frei. Dabei können die echten Dateien gelöscht werden. Es ist keine Sicherungskopie und keine Auswahl einzelner Staffeln. Lies dazu den Abschnitt „Staffellöschung & Archivierung“ weiter oben.' },
      { question: 'Werden bei der Staffellöschung nur meine angesehenen Folgen gelöscht?', answer: 'Nein. Der Freigabemodus beschränkt sich nicht auf deinen persönlichen Wiedergabestand und wählt nicht nur einzelne angesehene Staffeln aus. Entscheidend ist der von den Admins geprüfte Plan für die vorhandenen Dateien. Wenn du Folgen noch brauchst, wähle „Behalten“ oder kläre den Umfang vorab mit den Admins.' },
      { question: 'Kann ich archivierte Folgen später sofort wieder ansehen?', answer: 'Nicht unbedingt. Bei eingerichteter Wiederherstellung kann ein Platzhalter eine erneute Beschaffung auslösen. Diese benötigt Zeit und kann scheitern, wenn die Folge nicht erneut verfügbar ist. Wende dich bei Problemen an die Admins; eine Freigabe zurückzunehmen stellt gelöschte Dateien nicht automatisch wieder her.' },
      { question: 'Warum fehlen Titel in der Bibliothek?', answer: 'Prüfe zuerst die gewählte Bibliothek und aktive Filter. Setze die Filter zurück oder suche oben direkt nach dem Titel. Wenn etwas weiterhin fehlt oder der Wiedergabestatus falsch wirkt, wende dich an die Admins.' },
    ],
    shortcutsTitle: 'Schneller mit der Tastatur',
    shortcuts: [{ key: '/', text: 'Suche fokussieren' }, { key: '?', text: 'Tastenkürzel anzeigen' }, { key: 'Enter / Space', text: 'Fokussierte Titelkarte auf „Behalten“ umschalten' }, { key: 'Esc', text: 'Tastenkürzel und Navigation schließen' }],
    steps: [
      { title: 'Finde deine Titel', text: 'Starte mit „Was soll bleiben?“ oder suche gezielt in der Bibliothek. Du musst nicht alles auf einmal entscheiden.', action: 'Bibliothek öffnen', actionHref: '/library' },
      { title: 'Schütze, was dir wichtig ist', text: 'Wähle an der Übungskarte „Behalten“. Eine einzige Person reicht aus, um den Titel vor der automatischen Übergabe zum Aufräumen zu schützen.', action: '„Behalten“ ausprobieren', actionHref: '#practice-keep' },
      { title: 'Unterscheide die Entscheidungen', text: 'Probiere „Ist mir egal“ und „Kann gelöscht werden“. Die Freigabe ist im Alltag nur bei eigenen Anfragen verfügbar. Hier kannst du alle Möglichkeiten gefahrlos testen.', action: 'Freigabe an der Übungskarte ausprobieren', actionHref: '#practice-release' },
      { title: 'Du behältst die Kontrolle', text: 'Du kannst deine Auswahl später ändern. Vor einer automatischen Übergabe greifen zusätzlich die Schutzregeln. Eine Freigabe ist niemals gleichbedeutend mit sofortiger Löschung.', action: 'Schutzregeln kennenlernen', actionHref: '#gates' },
    ],
  },
  en: {
    eyebrow: 'Your guide', title: 'You decide what stays.',
    intro: 'Protect your favorites, discover titles and make room together. Everything you need to get started – no technical knowledge required.',
    start: 'Get started in 4 steps', browse: 'Open library', contents: 'Jump to a topic',
    tutorial: 'Your quick start', tutorialIntro: 'Try it before you decide. This exercise never changes real titles.',
    step: 'Step', previous: 'Back', next: 'Next', restart: 'Start again', finish: 'Finish exercise',
    done: 'You are ready to choose real titles! You can repeat this exercise at any time.',
    demo: 'Practice · no real changes', demoTitle: 'Your next favorite movie', demoHint: 'Try a choice. Select it again to undo it.',
    choices: { keep: 'Keep', skip: 'I don’t care', release: 'OK to delete' },
    outcomes: {
      none: 'Undecided. Without a selection you have not made a personal decision yet.',
      keep: 'You want to keep this title. Your Keep protects it from automatic cleanup hand-off, even if others release it.',
      skip: 'You do not need to protect this title. “I don’t care” is not an explicit release and does not override anyone else’s Keep.',
      release: 'You explicitly release a title you requested. This does not delete it immediately: safety rules and other people’s decisions still apply.',
    },
    basicsTitle: 'Find your way around',
    basics: [
      { id: 'choose', icon: 'keep', title: 'Choose what stays', text: 'Click a title card to toggle Keep. Your choice is saved immediately. In “For you”, “Save choices & continue” marks the remaining displayed titles you have not released as “I don’t care” and loads a fresh selection.' },
      { id: 'library', icon: 'library', title: 'Library & search', text: 'Filter the library by status, size and, when available, watch history. Expand or reset additional filters as needed. Use the search at the top for a specific title; search is independent of your library filters.' },
      { id: 'reclaim', icon: 'reclaim', title: 'Free up space', text: 'Find explained cleanup suggestions for titles nobody keeps. A high score is a suggestion, not a deletion decision. Selecting Keep removes a title from the suggestions.' },
      { id: 'campaigns', icon: 'campaigns', title: 'Review campaigns together', text: 'Campaigns let you review a fixed selection together. Keep titles or release them within the campaign. Eligible releases can be handed off only after closure; a current Keep still protects them.' },
      { id: 'stats', icon: 'stats', title: 'The big picture', text: 'Explore sizes, protected titles and potential cleanup candidates. Potentially reclaimable space is an estimate, not space that is already available.' },
      { id: 'appearance', icon: 'settings', title: 'Make it yours', text: 'Use your account menu at the top right to change the language, light or dark theme and color-impaired mode. Your title decisions are unaffected.' },
    ],
    seasonsTitle: 'Season deletion & archiving',
    seasonsIntro: 'Want to release existing episodes for cleanup rather than release the entire title for removal? Use “Archive existing seasons”.',
    seasons: [
      { id: 'select', icon: 'library', title: '1. Choose the release mode', text: 'On a show assigned to you as your own request, find the “Release mode” selector on its card. Select “Archive existing seasons”, or “Archive seasons” in list view. If you have not released it yet, confirm with “OK to delete”. Changing the mode on an already released title saves it immediately.' },
      { id: 'scope', icon: 'reclaim', title: '2. Existing files, not full-series removal', text: 'This releases existing episode files. It does not let you select individual seasons or automatically limit removal to watched episodes. Admins review the exact scope in a preview. Continuing shows that match automatic rules also enter this separate workflow rather than full-title removal.' },
      { id: 'review', icon: 'keep', title: '3. Review before execution', text: 'Your choice does not delete anything immediately. A Keep still protects the show. Admins review the exact plan before execution; the release and files are checked again. Active downloads or failed required checks block the process. Automatic candidates also follow watch-history and observation rules.' },
      { id: 'restore', icon: 'help', title: '4. What remains visible?', text: 'When placeholders are configured, archived episodes can remain visible as small information videos. Playing a placeholder can request that the episode be acquired again; admins can also request this. The real episode is not immediately available again. Without the required setup, do not assume a placeholder will appear.' },
    ],
    seasonsNote: 'Important: “Archive” does not mean a backup copy here. Real video files can be deleted and replaced with placeholders. Later restoration depends on setup and renewed availability. Before execution, you can undo your release or select Keep; this does not automatically bring back files already removed.',
    gatesTitle: 'Gates: safety before automatic cleanup',
    gatesIntro: 'A release is not a delete button. Several conditions are checked before automatic hand-off. Admins decide which features are enabled.',
    gates: [
      { id: 'keep', icon: 'keep', title: 'One Keep is enough', text: 'If anyone keeps a title, it is excluded from automatic hand-off. You can undo only your own decision, not someone else’s.' },
      { id: 'watch', icon: 'stats', title: 'Everyone’s viewing counts', text: 'Even if the requester has stopped watching, another person’s recent watch protects the title. The default protection window is 180 days.' },
      { id: 'observe', icon: 'reclaim', title: 'Observe first', text: 'Automatic candidates are observed for 30 days by default. A Keep or playback that breaks the rule resets that observation. Explicit releases follow a different process.' },
      { id: 'playback', icon: 'library', title: 'Check current playback', text: 'Where live checks are supported, playing, paused and buffering titles are protected. For shows this protects the entire series.' },
      { id: 'collections', icon: 'campaigns', title: 'Consider collections together', text: 'For supported movie collections, a protected, ineligible or unknown member can protect the entire collection from automatic release.' },
      { id: 'stop', icon: 'help', title: 'Pause when uncertain', text: 'Unavailable required live checks pause hand-off. Large change sets and unexpected re-additions require explicit admin approval.' },
    ],
    gatesNote: '180 and 30 days are configurable defaults, not a display of your current settings. Live and collection protection depend on setup. Checks apply at the time of checking; later deletion is a separate process.',
    faqTitle: 'Still have a question?', search: 'Search questions …', noResults: 'No matching question. Try “Keep”, “release” or “filters”.', clear: 'Clear search',
    faqs: [
      { question: 'What is the difference between “I don’t care” and a release?', answer: '“I don’t care” means you have no personal wish to keep it. A release is explicit permission to clean up. Neither overrides someone else’s Keep; automatic rules may check unprotected titles independently.' },
      { question: 'Why is “OK to delete” not available on every title?', answer: 'Personal releases are available for titles assigned to you as your requests. Campaigns also let you review the titles included in them.' },
      { question: 'Can I change my mind?', answer: 'Yes. Undo your Keep, “I don’t care” or personal release, or replace it with another choice. This does not automatically restore a title that has already been removed.' },
      { question: 'What does “Save choices & continue” do?', answer: 'In “For you”, remaining displayed titles you neither kept nor explicitly released are marked “I don’t care”. A new selection is then loaded. Clicking Keep already saves that choice immediately.' },
      { question: 'Why is a released title still here?', answer: 'A release does not delete immediately. Someone may keep it, it may have been watched recently, a waiting period may still apply or a required check may be unavailable. Downstream processing also takes time.' },
      { question: 'What does “Why?” on a title mean?', answer: 'It explains current Keep protection without naming other users. Additional admin information may come from an older check and is not current approval.' },
      { question: 'What does “Archive existing seasons” mean for season deletion?', answer: 'You release existing episode files for a separate admin-reviewed workflow. Real files can be deleted. This is not a backup and does not select individual seasons. See “Season deletion & archiving” above for details.' },
      { question: 'Does season deletion remove only episodes I have watched?', answer: 'No. The release mode is not limited to your personal viewing history and does not select only watched seasons. The admin-reviewed plan determines which existing files are affected. If you still need episodes, choose Keep or discuss the scope with your admins first.' },
      { question: 'Can I watch archived episodes again immediately?', answer: 'Not necessarily. Where restoration is configured, a placeholder can trigger a request to acquire the episode again. This takes time and may fail if it is no longer available. Contact your admins if needed; undoing a release does not automatically restore deleted files.' },
      { question: 'Why are titles missing from the library?', answer: 'Check the selected library and active filters first. Reset filters or search directly at the top. If a title is still missing or watch status seems incorrect, contact your admins.' },
    ],
    shortcutsTitle: 'Move faster with your keyboard',
    shortcuts: [{ key: '/', text: 'Focus search' }, { key: '?', text: 'Show keyboard shortcuts' }, { key: 'Enter / Space', text: 'Toggle Keep on a focused title card' }, { key: 'Esc', text: 'Close shortcuts and navigation' }],
    steps: [
      { title: 'Find your titles', text: 'Start with “Choose what stays” or browse the library. You do not need to decide everything at once.', action: 'Open library', actionHref: '/library' },
      { title: 'Protect what matters to you', text: 'Select Keep on the practice card. One person is enough to protect a title from automatic cleanup hand-off.', action: 'Try Keep', actionHref: '#practice-keep' },
      { title: 'Understand the choices', text: 'Try “I don’t care” and “OK to delete”. In normal use, personal release is only available for your own requests. Here you can safely try everything.', action: 'Try releasing the practice title', actionHref: '#practice-release' },
      { title: 'Stay in control', text: 'You can change your choice later. Safety rules also apply before automatic hand-off. A release never means immediate deletion.', action: 'Explore safety rules', actionHref: '#gates' },
    ],
  },
};

export function filterHelpFaqs(locale: Locale, query: string) {
  const terms = query.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  return helpContent[locale].faqs.filter(({ question, answer }) => {
    const text = `${question} ${answer}`.toLocaleLowerCase(locale);
    return terms.every((term) => text.includes(term));
  });
}