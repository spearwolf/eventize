# Remediation-Plan — @spearwolf/eventize

Quelle: ./audit.html vom 2026-07-26 (Score 80,5) · Branch: `main` · erstellt: 2026-07-26
Baseline: clean ✓ · build ✓ · attw 4/4 ✓ · test 538/538 ✓ (Coverage 98,88 / 97,15 / 95,27 / 99) · lint ✓ · format ✓
Scope: 7 von 14 Findings (1 high, 3 medium, 3 low) + 3 Punkte aus »Optimierungspotenzial« · 8 Pakete

## Scope

**Enthalten:** BUG-001, BUG-002, BUG-003, BUG-004, TYPE-001, PERF-001, CONS-001 sowie aus dem
Optimierungspotenzial: Konformitäts-Suite über alle drei Oberflächen, `verbatimModuleSyntax` aktivieren,
CI-Duplikat auflösen.

**Auf Wunsch des Nutzers ausgenommen** (2026-07-26): TEST-001, TEST-002, BUILD-001, DEP-001, DX-001,
INFO-001, INFO-002. Zwei Berührungspunkte sind unvermeidbar und deshalb hier festgehalten:

- **TEST-001** ist als Finding draußen, sein Inhalt kommt über die Konformitäts-Suite (Paket 3) trotzdem
  zum Zug — die fünf ungetesteten Delegationen sind genau das, was diese Suite abdeckt.
- **DX-001** ist als Finding draußen, aber Paket 5 ändert das Verhalten, das `docs/off.md` beschreibt.
  Die fehlende Tabellenzeile wird dort mitgeschrieben, weil eine Verhaltensänderung ohne Doku-Update
  gegen die Documentation-Obligations in `AGENTS.md` verstößt. Nicht als eigener Punkt geführt.

**Nicht aus dem Audit übernommen** (im Optimierungspotenzial genannt, nicht angefordert):
Benchmark-Harness, `Object.freeze(Priority)`.

## Entscheidungen

- **BUG-003 — `off(ε, '*', listenerObject)` meldet ab** (2026-07-26). `'*'` wird in dieser Branch auf
  `catchEmAllListeners` umgeleitet; der Aufruf entfernt genau die Wildcard-Subscriptions dieses
  Listener-Objekts. Nicht werfen, nicht als No-Op dokumentieren.
- **BUG-004 — die Zusage wird eingeschränkt, der Code bleibt** (2026-07-26). »Equal priorities keep
  insertion order« gilt künftig ausdrücklich nur innerhalb eines Buckets; die Bevorzugung benannter
  Listener bei Prioritätsgleichheit wird selbst zur dokumentierten Zusage und per Spec gepinnt.
- **PERF-001 — ohne Benchmark-Harness umsetzen** (2026-07-26). Die weggefallene Allokation ist
  beweisbar keine Verschlechterung; ein Harness wird nicht nachgerüstet.
- **Versionierung — minor statt major** (2026-07-26). `v6.0.0` existiert nur im git und ist nicht auf
  npm veröffentlicht, es gibt also keinen Consumer, der sich auf das heutige Verhalten verlässt.
  Pakete schreiben unter `## Unreleased`; der Abschluss konsolidiert zu `v6.1.0`.
- **`verbatimModuleSyntax` ist unmöglich, ESLint `consistent-type-imports` tritt an seine Stelle**
  (2026-07-26). `ts-jest` erzwingt auf dem CJS-Pfad `module: commonjs`; darunter ist unter
  `verbatimModuleSyntax` **jeder** ESM-Import in einer `.ts`-Datei ein Fehler (TS1295/TS1287), nicht nur
  der Konventionsverstoß — nachgeprüft mit
  `npx tsc --noEmit --module commonjs --verbatimModuleSyntax src/index.ts`. Das Flag bindet also
  entweder nirgends oder es zerlegt alle 27 Suiten. Die Regel `consistent-type-imports` erreicht
  dasselbe Ziel, bindet über `lint` sicher im `cbt`-Gate und greift zusätzlich in den Spec-Dateien.
  Modulsystem, `tsconfig.json` und Jest-Setup bleiben unangetastet.
- **Named-Func-Pfad bleibt unangetastet** (2026-07-26). `on(ε, 'evt', 'toString', obj)` benennt die
  Methode ausdrücklich — dort ist der Prototypen-Treffer die Wahl des Aufrufers, nicht ein Unfall.
  Die Schranke aus Paket 4 gilt nur für den Listener-Objekt- und den Duck-Typing-Pfad.

## Vorbestehende Fehler

Keine. Die Baseline ist auf allen sechs Gate-Stufen grün; jeder rote Lauf ab hier gehört zum Paket,
das gerade läuft.

## Pakete

### [x] 1. CI-Gate auf `npm run cbt` zusammenführen

- Findings: Optimierungspotenzial »CI-Duplikat auflösen«
- Ziel: Beide Workflows rufen dasselbe Gate auf, das lokal gilt, statt fünf Schritte doppelt zu listen.
- Dateien: `.github/workflows/dev.yml`, `.github/workflows/main.yml`
- Modell: günstigste Stufe
- Verify: `npm run cbt` (belegt, dass das Gate selbst grün ist) + Diff-Review; ein lokaler YAML-Linter
  existiert im Projekt nicht.
- Commit: `ci: run the cbt gate instead of duplicating its steps`
- Hash: `9c2ce4a`
- Review: Erfüllung bestätigt, keine Qualitätsbefunde. Kosmetisch notiert: fünf sprechende Step-Namen
  werden zu einem generischen »Run cbt gate« — bewusst, der Job-Name trägt den Kontext.

**Optimierungspotenzial · CI-Duplikat** — `dev.yml` und `main.yml` listen dieselben fünf Schritte
einzeln auf. Ein Job, der `npm run cbt` aufruft, hält lokale und entfernte Gate-Definition automatisch
deckungsgleich — genau das Auseinanderlaufen, das der Vorlauf als BUILD-003 gemeldet hatte und das
jetzt behoben, aber nicht strukturell verhindert ist.

Umsetzung: In beiden Workflows die fünf Einzelschritte (`npm test -- --coverage`, `npm run build`,
`npm run lint`, `npm run format:check`, `npm run checkPkgTypes`) durch einen Schritt `npm run cbt`
ersetzen. Die Node-Matrix (18, 20, 22, 24), `npm ci`, `actions/checkout@v4`, `actions/setup-node@v4`
mit `cache: 'npm'` und der komplette `deploy`-Job in `main.yml` bleiben unverändert. `cbt` beginnt mit
`clean`, das Build-Artefakte entfernt — der `deploy`-Job baut ohnehin selbst, und er läuft in einem
eigenen Runner-Job.

### [x] 2. Typ-Import-Konvention als Lint-Regel erzwingen

- Findings: CONS-001, Optimierungspotenzial »`verbatimModuleSyntax` aktivieren« (auf ESLint umgestellt,
  siehe Entscheidungen)
- Ziel: Die Typ-Import-Konvention wird eine erzwungene Regel statt einer Gewohnheit, und die Verstöße
  dagegen verschwinden.
- Dateien: `eslint.config.mjs`, `src/getSubscriptionCount.ts`, `src/subscribeTo.ts`, plus Fallout
- Modell: mittlere Stufe
- Verify: `npx jest --clearCache && npm run cbt`
- Commit: `chore(lint): enforce type-only imports via consistent-type-imports (CONS-001)`
- Hash: `4454811`
- Erster Versuch BLOCKIERT (`verbatimModuleSyntax` vs. ts-jest), nach Nutzerentscheidung neu beauftragt.
- Die Regel fand **fünf** Treffer statt der einen aus CONS-001; vier davon hat das Audit nicht gesehen:
  `getSubscriptionCount.ts:1` (EventStore), `subscribeTo.ts` (EventStore), `eventize-api.ts:1`
  (EventListener), `getRetainedCount.ts:1` (EventKeeper), `composition-over-inheritance.spec.ts:3`
  (Eventize). Jeder einzeln gegen echte Wert-/Typverwendung geprüft, Review bestätigt.
- Konfiguration: `prefer: 'type-imports'` + `fixStyle: 'separate-type-imports'` — separate
  `import type`-Zeilen statt Inline-Qualifier, deckungsgleich mit der Konvention in `src/`.
- Review: Erfüllung bestätigt, keine Qualitätsbefunde.
- Nebenbefund (nicht in diesem Lauf): `tsconfig.json` setzt weder `module` noch `moduleResolution`, also
  gilt `tsc -p` faktisch `module: ES6` / `moduleResolution: classic`, während ts-jest `CommonJS`
  erzwingt. Diese Diskrepanz ist die Ursache des Blockers und gehört zu BUILD-001 (ausgenommen).

**CONS-001 · low · src/getSubscriptionCount.ts:4** — Typ-Import als Wert-Import in getSubscriptionCount
`import {EventizedObject} from './types'` — EventizedObject ist ein Interface und wird ausschließlich in
Typposition verwendet. Jedes andere Modul unter `src/` schreibt an dieser Stelle `import type`,
einschließlich des unmittelbar benachbarten `getRetainedCount.ts`, das dieselbe Konstruktion korrekt
macht. Esbuild entfernt das Binding beim Bundling, es entsteht also kein Laufzeitschaden — ein
Stilbruch, keine Fehlfunktion.
Empfehlung: Auf `import type` umstellen. Dauerhaft absichern lässt sich das nur über
`verbatimModuleSyntax` (siehe Optimierungspotenzial) oder die ESLint-Regel `consistent-type-imports`.

**Optimierungspotenzial · verbatimModuleSyntax** — Macht die Typ-Import-Konvention des Repos zu einer
Compiler-Regel statt zu einer Gewohnheit — CONS-001 wäre dann nicht auffindbar, sondern unmöglich.

Umsetzung: `@typescript-eslint/consistent-type-imports` in `eslint.config.mjs` auf `error` setzen —
`verbatimModuleSyntax` fällt weg, siehe Entscheidungen. Die Regel greift auch in Spec-Dateien; falls die
Konfiguration `src/**/*.spec.ts` in einem eigenen Block behandelt, muss die Regel dort ebenfalls gelten.
Danach `npm run lint` und **jeden** gemeldeten Treffer auflösen, keine Suppression, keine
`--fix`-Änderung, die ungeprüft bleibt. Bekannt sind zwei:

- `src/getSubscriptionCount.ts:4` — `import {EventizedObject} from './types'`, reine Typposition
  (CONS-001).
- `src/subscribeTo.ts:1` — `import {EventKeeper, KeeperEvent} from './EventKeeper'`; `KeeperEvent` ist
  ein Typ, `EventKeeper` wird als Wert gebraucht. Aufteilen in Wert- und Typ-Import. Diese zweite
  Instanz hat das Audit nicht gesehen — sie zählt als Fallout desselben Findings, nicht als neues.

`tsconfig.json` bleibt unangetastet, ebenso `moduleResolution` und `include` — BUILD-001 ist
ausdrücklich nicht im Scope. Vor dem Verifizieren trotzdem `npx jest --clearCache`.

### [x] 3. Konformitäts-Suite über alle drei Oberflächen

- Findings: Optimierungspotenzial »Konformitäts-Suite über alle drei Oberflächen« (deckt inhaltlich
  TEST-001 mit ab, das als Finding ausgenommen ist)
- Ziel: Dieselben Verhaltensfälle laufen einmal je Oberfläche, damit »drei Oberflächen, eine
  Implementierung« geprüft ist statt behauptet.
- Dateien: `src/__test-utils__/expect2ImplEventizeApi.ts`, neue Spec-Datei unter `src/`,
  `jest.config.ts`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `test: exercise all three API surfaces against the same behaviour table`
- Hash: `7a263b2`
- Neue Datei `src/api-surfaces.spec.ts`: 9 Verhaltensfälle × 3 Oberflächen = 27 Tests, Gesamtsuite
  538 → 565. `apiSurfaces` (Tabelle mit `create()`-Factory pro Oberfläche) liegt in
  `expect2ImplEventizeApi.ts`; der bestehende Export blieb unverändert, beide Aufrufstellen laufen ohne
  Änderung weiter.
- Funktionsabdeckung `src/eventize.ts`: 77,27 % → 100 %, unabhängig nachgemessen. Alle fünf zuvor
  ungetesteten Delegationen laufen.
- Schwellen `jest.config.ts`: statements 97→99, branches 93→97, functions 93→99, lines 97→99
  (gemessen 99,81 / 97,15 / 99,21 / 100, jeweils abgerundet).
- Review: Erfüllung bestätigt, zwei **kleine** Befunde, bewusst nicht nachgearbeitet:
  - `new (class extends Eventize {})()` statt `new Eventize()` — unnötige Indirektion, funktional gleich.
  - Die `as unknown as ConformityApi`-Casts entkoppeln `ConformityApi` vom echten Rückgabetyp von
    `eventize.inject()` / `new Eventize()`; driftet eine Signatur, meldet TS das nicht. Die Suite prüft
    dann weiterhin Laufzeitverhalten, was hier der Zweck ist.
- Nebenbefund (nicht in diesem Lauf): `format:check` erfasst `jest.config.ts` nicht, dessen Glob endet
  bei `src/**`. Die Datei ist unformatiert und das Gate sieht es nicht.

**Optimierungspotenzial · Konformitäts-Suite** — `expect2ImplEventizeApi` prüft heute nur, dass die
Methoden existieren. Eine tabellengetriebene Suite, die dieselben Verhaltensfälle einmal je Oberfläche
fährt, würde TEST-001 nicht nur schließen, sondern die Invariante »eine Implementierung« dauerhaft
absichern, statt sie zu behaupten.

Hintergrund aus TEST-001 (Finding selbst ausgenommen, die Messung gilt): Aus `coverage-final.json` sind
`inject().off`, `inject().emitAsync` sowie `Eventize.once`, `Eventize.off` und `Eventize.emitAsync` von
keinem Test aufgerufen — `src/eventize.ts` liegt bei 77,27 % Funktionsabdeckung gegen 95,27 % im
Projektschnitt. Die Zeilen sind `src/eventize.ts:93, 99, 140, 151, 159`.
`expect2ImplEventizeApi` (`src/__test-utils__/expect2ImplEventizeApi.ts:3-30`) prüft ausschließlich
`typeof obj.x === 'function'`, also Vorhandensein, nie Delegation.

Umsetzung: Eine tabellengetriebene Suite, die je Fall über drei Oberflächen iteriert — freie Funktionen
(`on(ε, …)`), `eventize.inject(obj)`-Methoden und `class Eventize`. Jeder Fall braucht einen frischen
Emitter, also arbeitet die Suite mit einer Factory pro Oberfläche, nicht mit einem geteilten Objekt.
Abzudeckende Fälle mindestens: `on` + `emit` mit Argumenten, `once` (feuert genau einmal),
`onceAsync`, `off` in der bulk- und in der namensbezogenen Form, `emitAsync`-Aggregation,
`retain` + Replay an einen späteren Subscriber, `unretain`, `retainClear`. Die fünf oben genannten
Delegationen müssen dabei tatsächlich laufen.
`expect2ImplEventizeApi` darf als Existenzprüfung bleiben oder erweitert werden — alle bestehenden
Aufrufstellen müssen weiter funktionieren, ohne dass Spec-Dateien umgeschrieben werden.
Danach die Schwellen in `jest.config.ts` anheben: `functions` und alles andere, das gestiegen ist, auf
den neuen gemessenen Wert **abgerundet auf die nächste ganze Zahl darunter** — nie exakt auf den
Messwert, das macht die Schwelle brüchig. Aktuell: statements 97, branches 93, functions 93, lines 97.

### [x] 4. Object.prototype-Schranke in beiden Dispatch-Pfaden

- Findings: BUG-001, BUG-002
- Ziel: Ein Event-Name, der auf ein geerbtes `Object.prototype`-Member trifft, dispatcht nicht mehr
  dorthin — auf beiden Pfaden, in einem Commit.
- Dateien: `src/EventListener.ts`, `src/eventize-api.ts`, `src/EventListener.spec.ts`,
  `src/emit-ducktyping.spec.ts`, `CHANGELOG.md`, `skills/using-eventize/`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `fix(dispatch): don't dispatch to inherited Object.prototype members (BUG-001, BUG-002)`
- Hash: `cae8ef4`
- Roter Lauf belegt: 42 von 126 Tests in den drei betroffenen Suiten fielen vor dem Fix. Der Reviewer
  hat das per Gegenprobe reproduziert (Quelländerung zurückgedreht → dieselben 42).
- Fix: neues `dispatchableMember(target, eventName)` in `src/utils.ts` — liefert den Member, außer er ist
  **identisch** mit `Object.prototype[eventName]`. Beide Dispatch-Pfade (`EventListener.apply()`
  LISTENER_IS_OBJ-Zweig, `_duckEmitOne()`) lesen darüber; ein Early Return bei `undefined` spart den
  zweiten Property-Read auf dem heißen Pfad.
- Die Schranke deckt **11** Namen, nicht die sieben des Audits: dazu kommen V8s `__defineGetter__`,
  `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`. Die beiden `__define*` warfen vorher einen
  `TypeError` mitten im Dispatch — vom Audit nicht gemessen.
- Suite 565 → 621 (56 neue Fälle). Alle vier Randbedingungen per Spec gehalten und vom Reviewer
  einzeln nachgemessen; der Named-Func-Pfad ist unangetastet und die Grenze in beiden Richtungen gepinnt.
- Doku: `CHANGELOG.md` (`## Unreleased`), `README.md`, `AGENTS.md`, `docs/lifecycle.md`,
  `skills/using-eventize/SKILL.md`, `references/api-details.md`, `references/migration.md`.
- Zwei Review-Runden über kleine Befunde, alle faktischer Natur (falsche Aussage zu den `__`-Namen, die
  Zusage »own or subclass override« hielt für identisch zugewiesene Aliase nicht, überholte Zahlen, ein
  einseitig gepinnter Spec). Nach Runde 2 abgeschlossen; was danach auffiel, steht hier:
- **Offene Nebenbefunde für das nächste Audit** (bewusst nicht in diesem Lauf):
  - Die Schranke ist realm-lokal. Ein Objekt aus `vm.runInNewContext` dispatcht weiter an sein eigenes
    `Object.prototype.toString` — symmetrisch auf beiden Pfaden, also keine Divergenz, nur eine Lücke.
  - Nur `Object.prototype` ist geschützt. `on(ε, 'has', new Map())` dispatcht an `Map.prototype.has`,
    ebenso `push` bei einem Array oder `getTime` bei einem Date.
  - Ein klasseneigener `constructor` bleibt ein Treffer: `emit(new Foo(), 'constructor')` wirft
    `TypeError: Class constructor Foo cannot be invoked without 'new'`. Vorbestehend.
  - Vier Doku-Stellen stempeln »v6.1.0« (`SKILL.md`, `docs/lifecycle.md`, `migration.md` zweimal). Fällt
    die Semver-Bewertung im Abschluss anders aus, sind sie falsch.
  - `docs/lifecycle.md` sagt in der Einleitung »This describes the **v6.0.0** state« — im Abschluss
    mitzuziehen.
  - `format:check` erfasst weder `jest.config.ts` noch eine der Markdown-Dateien; sein Glob endet bei
    `src/**`.

**BUG-001 · high · src/EventListener.ts:216** — Dispatch an Listener-Objekte trifft geerbte
Object.prototype-Methoden
`apply()` liest den Member ohne Prototypen-Schranke: `apply(listener, listener[eventName], …)`. Ein
Event-Name, der mit einem `Object.prototype`-Member kollidiert — `toString`, `valueOf`, `constructor`,
`hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` — findet die geerbte
Funktion und ruft sie auf. Nachgemessen am gebauten Paket: `once(ε, {})` gefolgt von
`emit(ε, 'toString')` setzt den Subscription-Zähler von 1 auf 0 — das `once()` ist verbrannt, ohne dass
je eine Nutzer-Methode lief. `emitAsync(ε, 'toString')` liefert zusätzlich `['[object Object]']` in die
Aggregation. Besonders unangenehm bei Catch-all-Listener-Objekten, die per Definition jeden Event-Namen
sehen. Die Bibliothek verteidigt sich an genau dieser Stelle bereits gegen Primitive: `isObjListener`
(`EventListener.ts:40`) existiert laut eigenem Kommentar, damit `on(ε, 'toFixed', 42)` nicht an
`Number.prototype` dispatcht — gegen `Object.prototype` greift dieselbe Überlegung nicht.
Empfehlung: Vor dem Dispatch prüfen, ob der gefundene Member nicht identisch mit dem gleichnamigen
`Object.prototype`-Member ist: `const fn = listener[eventName]; if (typeof fn === 'function' && fn !==
Object.prototype[eventName])`. Das lässt eigene Overrides zu und schließt nur die unbeabsichtigte
Vererbung aus. Specs für alle sieben kollidierenden Namen, je einmal für `on()` und `once()`.
Verhaltensänderung, also CHANGELOG-Eintrag.

**BUG-002 · medium · src/eventize-api.ts:106** — Duck-typed emit() dispatcht ebenfalls an
Object.prototype
`_duckEmitOne()` liest `target[eventName]` mit derselben fehlenden Schranke wie BUG-001, nur auf dem
Pfad für nicht-eventisierte Ziele. Gemessen: `emitAsync({}, 'toString')` liefert `['[object Object]']`,
`emitAsync({}, 'constructor')` liefert `[{}]` — der Object-Konstruktor wird als gewöhnliche Funktion
aufgerufen und sein Ergebnis aggregiert. Ein Plugin- oder Bridge-Layer, das Event-Namen aus externen
Daten bezieht (JSON-Keys, Message-Types, DOM-Attribute), trifft das ohne Vorwarnung. `AGENTS.md` führt
als Invariante, dass beide Dispatch-Pfade im Gleichschritt bleiben müssen — ein Fix nur an einer Stelle
würde genau diese Invariante brechen.
Empfehlung: Dieselbe Prüfung wie in BUG-001 einsetzen und beide Pfade in einem Commit ändern. Der
bestehende Spec-Block »plain object without a matching method« in `emit-ducktyping.spec.ts` ist die
passende Stelle für die neuen Fälle.

Umsetzung: Zuerst die fehlschlagenden Specs schreiben und rot sehen, dann fixen. Randbedingungen, die
erhalten bleiben müssen: ein **eigener** Override (`{toString() {…}}`) dispatcht weiter; die
`emit()`-Fallback-Kette (`listener.emit(eventName, …)`) bleibt erreichbar, wenn der Namens-Treffer
wegfällt; ein `once()` überlebt einen Dispatch, der nur den Prototypen getroffen hätte, genau wie es
seit v6.0.0 einen Dispatch ohne Treffer überlebt; `Object.create(null)` als Listener-Objekt bleibt
funktionsfähig. Der Named-Func-Pfad (`EventListener.ts:203`) wird **nicht** angefasst — siehe
Entscheidungen. Doku: Eintrag unter `## Unreleased` in `CHANGELOG.md` und die Dispatch-Semantik in
`skills/using-eventize/SKILL.md` bzw. `references/api-details.md` (Abschnitt »Listener-object
dispatch«) nachziehen.

### [x] 5. `off(ε, '*', listenerObject)` meldet die Wildcard-Subscriptions ab

- Findings: BUG-003
- Ziel: Der Aufruf, der wörtlich »melde dieses Objekt vom Wildcard ab« bedeutet, tut das auch.
- Dateien: `src/EventStore.ts`, `src/off.spec.ts`, `docs/off.md`, `CHANGELOG.md`,
  `skills/using-eventize/references/api-details.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `fix(off): detach a listener object from wildcard subscriptions (BUG-003)`
- Hash: `611006a`
- Roter Lauf belegt: 9 von 67 Tests in `src/off.spec.ts` fielen vor dem Fix; der Reviewer hat per
  Gegenprobe 10 gezählt (der zehnte in `lifecycle.spec.ts`).
- Fix: `EventStore.removeByEventNameAndListenerObject()` zweigt bei `isCatchEmAll(eventName)` auf
  `catchEmAllListeners` ab und filtert dort mit demselben `removeSimilarListenersFromArray()` wie der
  benannte Zweig. Suite 621 → 633.
- Alle drei Grenzen gepinnt und vom Reviewer am Code nachgeprüft. Befund zu Grenze 3, wie verlangt am
  Code erhoben statt vermutet: **der benannte Zweig konsultiert `refCount` gar nicht** — er trifft per
  Identität und macht direkt `detach()` + `splice()`, während `unsub()` und `off(ε, unsub.listener)` über
  `removeByEventListener()` dekrementieren. Die Wildcard-Form zieht jetzt mit dem benannten Zweig gleich.
  Handles einer refCount-2-Registrierung werden dadurch inert, nicht kaputt: `detach()` setzt
  `isRemoved`, worauf `removeByEventListener()` sofort aussteigt.
- Doku: `CHANGELOG.md`, `docs/off.md` (Signaturzeile — inhaltlich DX-001 —, Beispiel, Retained-Liste),
  `docs/lifecycle.md`, `AGENTS.md` (»Known asymmetries«), `README.md`, `SKILL.md`, `api-details.md`.
- Eine Review-Runde über drei Textstellen, die der Fix falsch gemacht hatte: ein Quellkommentar in
  `EventStore.ts`, der Catch-em-all-Listener aus diesem Pfad für unerreichbar erklärte, eine
  Versionsangabe in `docs/off.md` und die Zusage »the one form that carries both« in `docs/lifecycle.md`.
- **Offene Nebenbefunde für das nächste Audit** (bewusst nicht in diesem Lauf):
  - `off(ε, ['*'], obj)` bleibt der stille No-Op, den BUG-003 für die Skalar-Form beschrieb: die
    Array-Form fällt aus `forceRemove` heraus (`typeof listener !== 'string'`), landet in
    `removeByListener(['*'], obj)` und entfernt nichts. Typseitig erlaubt, nirgends dokumentiert.
  - `off(ε, '*', someString)` matcht jetzt Listener, deren `listener`/`listenerObject` dieser String ist
    — symmetrisch zum benannten Zweig, auf beiden Seiten ungetestet.
  - Zwei vorbestehend ungedeckte Branches in `EventStore.ts`: `if (listener.isRemoved) return;` in
    `removeByEventListener()` und `if (j < jLen)` in der Merge-Schleife von `forEach()`.

**BUG-003 · medium · src/EventStore.ts:268, src/eventize-api.ts:519** — `off(ε, '*', listenerObject)`
ist ein stiller No-Op
`off()` setzt `forceRemove`, sobald ein Event-Name mit einem Listener-Objekt kommt, und leitet damit auf
`removeByEventNameAndListenerObject()`. Diese Methode sucht ausschließlich in `namedListeners` —
Wildcard-Listener liegen aber in `catchEmAllListeners`. Gemessen: nach `on(ε, '*', fn, ctx)` steht der
Subscription-Zähler auf 1, nach `off(ε, '*', ctx)` immer noch auf 1, erst `off(ε, '*')` räumt ihn ab.
Der Aufruf, der wörtlich »melde dieses Objekt vom Wildcard ab« bedeutet, tut nichts und meldet nichts.
`docs/off.md:18` dokumentiert die benannte Schwester-Form als funktionierend, was die Erwartung
zusätzlich stützt. Kein Spec fixiert das Verhalten in irgendeine Richtung.
Empfehlung (entschieden, siehe Entscheidungen): `'*'` in dieser Branch auf `catchEmAllListeners`
umleiten. Dazu ein Spec und eine Zeile in der `off.md`-Tabelle.

Umsetzung: Erst der fehlschlagende Spec in `src/off.spec.ts`, rot gesehen, dann der Fix. Der
Wildcard-Fall geht in `catchEmAllListeners` statt in `this.namedListeners.get('*')`; die
Reference-Count-Semantik von `removeSimilarListenersFromArray()` bleibt dieselbe wie im benannten Fall.
**Retained State bleibt unberührt**: das ist eine gezielte Listener-Entfernung, nicht die bulk-Form
`off(ε, '*')`, die seit v6.0.0 alles räumt. Diese Grenze per Spec pinnen (`getRetainedCount(ε)` bleibt
unverändert), sonst driftet sie beim nächsten Umbau. Zu prüfen und per Spec festzuhalten ist außerdem,
dass benannte Subscriptions desselben Objekts von `off(ε, '*', ctx)` **nicht** mitentfernt werden —
dafür gibt es `off(ε, ctx)`.
Doku: neue Zeile `off(emitter, '*', listenerObject)` in der Signaturtabelle von `docs/off.md` (das ist
inhaltlich DX-001, siehe Scope), dieselbe Zeile in der `off()`-Shapes-Tabelle von
`skills/using-eventize/references/api-details.md`, Eintrag unter `## Unreleased` in `CHANGELOG.md`.
Falls `AGENTS.md` unter »Known asymmetries« eine Aussage berührt ist, dort mitziehen.

### [x] 6. `EventStore.forEach()` kopiert nur den Bucket, den es durchläuft

- Findings: PERF-001
- Ziel: Kein `slice(0)` mehr für einen Bucket, der nicht durchlaufen wird oder leer ist.
- Dateien: `src/EventStore.ts`, ggf. `src/EventStore.spec.ts`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `perf(store): only snapshot the listener bucket forEach() walks (PERF-001)`
- Hash: `713fc36`
- Umbau: `forEach()` entscheidet vor dem Kopieren, welcher Bucket gebraucht wird. Im häufigsten Fall —
  benanntes Event ohne Wildcard-Subscriber — entsteht statt zwei Kopien nur noch eine; der Merge-Zweig
  kopiert weiter beide, weil er beide durchläuft. Zweig-Auswahl beweisbar äquivalent: `!namedBucket` traf
  auch vorher nur `undefined`, ein leeres Array ist truthy.
- Der Reviewer hat den Umbau über einen Differentialtest mit 4000 randomisierten Reentrancy-Szenarien
  gegen `git show HEAD:src/EventStore.ts` abgesichert — identische Aufrufreihenfolge, identischer
  Rest-Subscription-Count. Der Harness war validiert: er findet einen eingebauten Live-Array-Rückfall.
- Ein **wichtiger** Befund, behoben: die zuerst geschriebenen drei Reentrancy-Tests für den
  Catch-all-Zweig blieben grün, wenn man den Kopierschutz entfernte — sie beschrieben Verhalten, das
  `isRemoved`, die Array-Trunkierung von `off(ε, '*')` und die eingefrorene `length` von
  `Array.prototype.forEach` ohnehin garantieren. Zwei neue Tests treffen jetzt das unterscheidende
  Szenario (Element verschwindet unter dem Cursor / Element davor verschwindet), beide per Mutant als
  rot belegt, unabhängig nachgefahren: genau 2 von 638 fallen. Die drei alten bleiben, kennzeichnen aber
  im Kommentar, was sie wirklich zeigen. Suite 633 → 638.
- Kein CHANGELOG-Eintrag: »Purely internal refactor« nach der Obligations-Tabelle.
- Offener Nebenbefund: `if (j < jLen)` in der Merge-Schleife (`EventStore.ts:358`) bleibt ungedeckt —
  ein unerreichbarer False-Arm, vorbestehend.

**PERF-001 · low · src/EventStore.ts:306-307** — `EventStore.forEach()` alloziert bei jedem `emit()`
zwei Arrays
Beide Buckets werden per `slice(0)` kopiert, damit ein Listener sich während seines eigenen Callbacks
ab- oder anmelden kann, ohne den Lauf zu stören. Die Absicht ist richtig, der Zuschnitt zu breit: die
Kopie entsteht auch für den leeren Catch-all-Bucket, also im häufigsten Fall überhaupt — reine
Allokation ohne Nutzen, und zwar auf dem heißesten Pfad einer Bibliothek, deren Verkaufsargument
synchrone Zustellgeschwindigkeit ist.
Empfehlung: Nur den Bucket kopieren, der tatsächlich durchlaufen wird, und die Kopie bei Länge 0
überspringen. (Der Benchmark-Harness wird laut Entscheidung nicht nachgerüstet — die Änderung tritt
ohne Messung an, weil eine weggefallene Allokation keine Verschlechterung sein kann.)

Umsetzung: Die drei Zweige von `forEach()` (nur Catch-all, nur benannt, Merge) entscheiden **vor** dem
Kopieren, welcher Bucket gebraucht wird. Der Reentrancy-Schutz muss in allen drei Zweigen erhalten
bleiben: wer während seines Callbacks ab- oder anmeldet, darf den laufenden Walk nicht verändern. Vor
dem Umbau prüfen, ob die bestehenden Specs Reentrancy für alle drei Zweige abdecken — nur benannt, nur
Wildcard, beide gemischt. Fehlt einer, wird er ergänzt, bevor der Umbau kommt. Kein Verhaltens- und
kein API-Wechsel, also kein CHANGELOG-Eintrag nötig; das Feld »Purely internal refactor« der
Documentation-Obligations-Tabelle trifft zu.

### [x] 7. `noUncheckedIndexedAccess` aktivieren

- Findings: TYPE-001
- Ziel: Die rohen Indexzugriffe in `EventStore` sind vom Compiler gedeckt statt vom Zutrauen.
- Dateien: `tsconfig.json`, `src/EventStore.ts`, ggf. Fallout in weiteren `src/`-Dateien
- Modell: mittlere Stufe
- Verify: `npx jest --clearCache && npm run cbt`
- Commit: `chore(ts): enable noUncheckedIndexedAccess (TYPE-001)`
- Hash: `96daaec`
- Fallout an fünf Stellen, alle ohne Suppression aufgelöst: `findInsertIndex`, `removeListenerFromArray`,
  die Merge-Schleife in `forEach()` sowie zwei Spec-Dateien (`documented-quirks.spec.ts`,
  `onceAsync.spec.ts`), die die Empfehlung nicht genannt hatte.
- Das Flag bindet im Gate, obwohl `cbt` kein eigenes `tsc --noEmit` fährt: ts-jest meldet die
  Diagnostics: ein künstlich eingebauter TS2322 bricht die Suite mit 0 Tests ab. Nachgewiesen, nicht
  angenommen.
- Reihenfolge-Äquivalenz der umgeschriebenen Merge-Schleife bewiesen: 14400 Differentialfälle gegen
  `git show HEAD:src/EventStore.ts` (Bucket-Längen 0–3 beidseitig, Prioritäten frei kombiniert samt
  Gleichstand über die Bucket-Grenze, drei Registrierungsreihenfolgen, drei Event-Namen), davon 4563 im
  Merge-Zweig — identische Aufrufreihenfolge. `lib/index.d.ts` und `.d.mts` byte-identisch zum
  HEAD-Build. Der Differentialtest war nicht blind: `>=` → `>` lässt ihn fallen, während die
  Projekt-Suite das nur mit **einem** Test fängt — BUG-004s Dünnheit bestätigt.
- Zwei Review-Runden. Bemerkenswert die zweite: der Reviewer hat seinen eigenen Vorschlag aus Runde 1
  widerlegt. Das dort empfohlene `else break;` gegen die Endlosschleife wirft in **keinem** von 49
  Lochmustern, wo HEAD in allen 49 warf, und lieferte stattdessen stumm ein gekürztes Präfix, das echte
  Listener hinter dem Loch verschluckt. Jetzt wirft die Schleife
  (`EventStore: forEach encountered a hole`), bei identischer Coverage. Ebenso wirft `findInsertIndex`
  statt eine Einfügeposition zu erfinden — über 7 Lochmuster geprüft: alt und neu werfen in genau
  denselben 5, nur der Fehlertyp ändert sich.
- Zwei neue Tests pinnen die beiden Abwehrzweige. Sie bauen einen Zustand, den die Klasse nie
  herstellt — der Coverage-Druck ist aber echt: ohne sie fallen die Branches auf 96,95 % gegen Schwelle
  97. Unter diesem Flag braucht jede handgeschriebene Merge-Schleife einen toten Laufzeitzweig, weil
  TypeScript `arr[i]` nicht aus `i < len` verengt; Suppressions verbietet der Plan, das Absenken der
  Schwelle verbietet `AGENTS.md`.
- Abweichung vom Prozess, bewusst: Runde 2 ging an denselben Implementierer statt an einen frischen eine
  Stufe höher. Der Auftrag war keine Wiederholung, sondern vollständig vorgeschrieben (`break` → `throw`,
  Test umdrehen, drei Textstellen), und die vorigen Runden waren im ersten Versuch erfolgreich.
- Kein CHANGELOG-Eintrag: `.d.ts` identisch, `tsconfig.json` wird nicht mitpubliziert.
- Offener Nebenbefund: vier weitere lochempfindliche Pfade in `EventStore` sterben unverändert mit einem
  `TypeError` aus fremder Hand (`isSimilar` zweimal, `remove(name, obj)`, `remove(obj)`), und
  `remove(fn)` schluckt Löcher still. Die Klasse verteidigt sich also an zwei Stellen, nicht überall.

**TYPE-001 · low · tsconfig.json:2-30** — `noUncheckedIndexedAccess` ist aus, obwohl EventStore roh
indiziert
`strict`, `strictNullChecks` und `noPropertyAccessFromIndexSignature` sind aktiv —
`noUncheckedIndexedAccess` und `exactOptionalPropertyTypes` nicht. `EventStore` rechnet an mehreren
Stellen roh mit Indizes: `arr[mid]` in der Binärsuche (`EventStore.ts:26`) sowie `namedListeners[i]` und
`catchEmAllListeners[j]` in der Merge-Schleife (`EventStore.ts:322-331`). Der Compiler typisiert diese
Zugriffe heute als immer definiert. Die Schleifen sind korrekt gegen ihre Längen geführt, es liegt also
kein aktueller Defekt vor — aber die schärfste verfügbare Absicherung für genau die Stelle, an der
BUG-004 sitzt, ist abgeschaltet.
Empfehlung: `noUncheckedIndexedAccess` aktivieren und den Fallout in `EventStore.ts` auflösen
(voraussichtlich wenige lokale Bindings). `exactOptionalPropertyTypes` getrennt bewerten, das trifft
eher `types.ts`.

Umsetzung: Läuft **nach** Paket 6, damit die Strictness die endgültige Form von `forEach()` deckt.
`"noUncheckedIndexedAccess": true` setzen, `npx tsc --noEmit`, Fallout über lokale Bindings mit
Nullish-Behandlung auflösen — keine `!`-Assertions und keine Suppressions; wo eine Invariante den
Zugriff sicher macht, gehört sie in den Code, nicht in ein Ausrufezeichen. Laufzeitverhalten darf sich
nicht ändern, die 538 Tests sind der Zeuge. `exactOptionalPropertyTypes` ist **nicht** Teil dieses
Pakets. Vor dem Verifizieren `npx jest --clearCache`.

### [x] 8. Die Reihenfolge-Zusage auf Bucket-Ebene einschränken

- Findings: BUG-004
- Ziel: Die Doku sagt, was der Code tut, und ein Spec hält beide Registrierungsrichtungen fest.
- Dateien: `skills/using-eventize/references/api-details.md`, `AGENTS.md`, `src/EventStore.spec.ts`
  (oder die passende bestehende Spec-Datei), `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `docs(order): scope the equal-priority guarantee to a single bucket (BUG-004)`
- Hash: `890c044`
- `EventStore.forEach()` unangetastet, wie entschieden. Zwei neue Specs halten beide
  Registrierungsrichtungen bei Prioritätsgleichheit fest; Mutationsmessung `>=` → `>` in der
  Merge-Schleife: 1 → 3 fallende Tests. Suite 640 → 642.
- Der Reviewer hat die eingeschränkte Zusage gegen den Code geprüft, auch für mehrere Listener gleicher
  Priorität in beiden Buckets (keine Verschränkung: alle benannten laufen vor allen Wildcards derselben
  Priorität) und für `±Infinity`. Sie hält.
- Eine Review-Runde über drei Textstellen. Bemerkenswert: die Begründung »die Asymmetrie überlebte, weil
  nur eine Richtung unter Test war« war falsch — die bestehende Sammel-Fixture in `EventStore.spec.ts`
  fährt die Wildcard-zuerst-Richtung längst, sie war nur implizit gepinnt und nicht benannt.
- Offener Nebenbefund: `NaN` als Priorität bricht die Zusage in beiden Hälften. `on(ε, 'foo', NaN, fn)`
  typecheckt, und bei zwei `NaN`-Prioritäten läuft die Wildcard zuerst, weil `cur.priority >=
  other.priority` falsch ist. `src/subscribeTo.ts` dokumentiert `NaN` schon als Gift für
  `sortByPriorityAndId`; eine Laufzeitprüfung gibt es nicht.

**BUG-004 · medium · src/EventStore.ts:324** — Zugesagte Reihenfolge bei Prioritätsgleichheit gilt nicht
bucket-übergreifend
`skills/using-eventize/references/api-details.md:72` sagt zu: »Equal priorities keep insertion order.«
Innerhalb eines Buckets stimmt das — `sortByPriorityAndId` bricht Gleichstand über die aufsteigende
`id`. Der Merge in `forEach()` vergleicht dagegen nur
`cur.priority >= catchEmAllListeners[j].priority` und sieht die `id` nie. Gemessen: Wildcard zuerst
registriert, benannter Listener danach, beide auf `Priority.Normal` — der benannte läuft zuerst. In der
umgekehrten Registrierungsreihenfolge sieht das Ergebnis korrekt aus, weshalb der Fehler nur in einer
von zwei Richtungen sichtbar wird und in Tests leicht durchrutscht.
Empfehlung (entschieden, siehe Entscheidungen): Die Zusage in `api-details.md` auf »innerhalb eines
Buckets« einschränken und die Bevorzugung benannter Listener explizit dokumentieren. Kein Code-Wechsel
in `forEach()`. Mit Spec und CHANGELOG-Eintrag.

Umsetzung: Der Merge in `EventStore.forEach()` bleibt wie er ist. `api-details.md:72` präzisieren:
Gleichstand hält die Registrierungsreihenfolge **innerhalb** eines Buckets (benannt bzw. Wildcard); bei
Prioritätsgleichheit **über** die Bucket-Grenze läuft der benannte Listener zuerst, unabhängig davon,
wer früher registriert wurde. In `AGENTS.md` unter »Known asymmetries« eine Zeile ergänzen, damit die
nächste Änderung an `forEach()` weiß, dass das eine Zusage ist. Specs für **beide**
Registrierungsrichtungen (Wildcard zuerst, benannt zuerst) bei gleicher Priorität — genau die
Asymmetrie, die der Vorlauf nicht sah. Eintrag unter `## Unreleased` in `CHANGELOG.md` als
Klarstellung, nicht als Verhaltensänderung.

## Abschluss

Alle acht Pakete erledigt, keines blockiert. 8 Paket-Commits plus dieser Abschluss-Commit, alle auf
`main`, ohne GPG-Signatur.

**Verify-Lauf über den übergebenen Baum:** `npx jest --clearCache && npx tsc --noEmit && npm run cbt` —
grün auf allen Stufen. 642 Tests in 28 Suiten (Baseline 538), Coverage 99,82 / 97,63 / 99,21 / 100 gegen
Schwellen 99 / 97 / 99 / 99 (Baseline-Schwellen waren 97 / 93 / 93 / 97), `attw --pack` 4/4, lint und
`format:check` sauber. Kein vorbestehender Fehler, also auch kein übernommener.

**Semver: `6.0.0` → `6.1.0`.** Nach der Bewertungstabelle wäre der Lauf **major** — Paket 4 und Paket 5
ändern Default-Verhalten, auf das Aufrufer sich verlassen konnten, und Paket 4 nimmt zwei Namen den Wurf
weg. Minor ist es auf ausdrückliche Entscheidung des Nutzers (2026-07-26) und weil sie tragfähig ist:
`v6.0.0` ist im git getaggt, hat die npm-Registry aber nie erreicht. Die letzte veröffentlichte Version
ist `v5.1.0`, `v6.1.0` wird das erste `6.x`, das ein Consumer sieht — der Major-Sprung, den er nimmt, ist
`5 → 6`, und `v6.0.0`s neun Breaking Changes kommen zusammen mit diesen beiden bei ihm an.

**CHANGELOG:** `## Unreleased` zu `## \`v6.1.0\`` konsolidiert, mit Einleitungsabsatz im Stil der Datei.
Zwei Folgekorrekturen: die Zusage im `v6.0.0`-Abschnitt, ein Consumer springe von `v5.1.0` direkt
dorthin, stimmt nicht mehr, und `docs/lifecycle.md` beschrieb sich als »the v6.0.0 state«.

**Nicht ausgeführt:** kein Push, kein Tag, kein Pull Request, kein `npm publish`. Der `v6.1.0`-Tag und
die Veröffentlichung gehören dem Nutzer.

### Offene Nebenbefunde

Elf Punkte fielen während der Umsetzung auf und waren bewusst nicht Teil dieses Laufs. Sie stehen bei den
Paketen, unter denen sie entdeckt wurden, und gehören ins nächste Audit — nicht in `audit.html`, das
dieser Lauf nicht anfasst.

Aus dem Scope ausgenommen blieben außerdem TEST-002, BUILD-001, DEP-001, INFO-001 und INFO-002.
TEST-001 ist über Paket 3 inhaltlich erledigt, DX-001 über Paket 5 — beide ohne eigenen Findings-Status.
