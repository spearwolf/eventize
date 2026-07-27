# Remediation-Plan — @spearwolf/eventize

Quelle: ./audit.html vom 2026-07-26 · Branch: `main` · erstellt: 2026-07-27
Baseline: clean ✓ · build ✓ · typecheck ✓ · attw 4/4 ✓ · test 29 Suiten / 677 Fälle ✓ · Coverage 99.82 / 98.02 / 99.23 / 100 ✓ · lint ✓ · format ✓
Gemessen mit `npx jest --clearCache && npm run cbt`, Exit 0, Arbeitsbaum sauber.
Scope: 2 von 8 offenen Findings — API-001 (medium), TYPE-003 (low). Vom Nutzer namentlich benannt.
Ausgenommen: MEM-002, CI-003, DEP-003, DX-002, TEST-002, BUILD-003 — nicht angefordert, bleiben im Backlog.

Der Vorgängerplan (5 Pakete, alle erledigt, Stand v6.2.0) liegt in `git show d93aeac:remediation-plan.md`.

## Entscheidungen

- **API-001 wird durch Streichen behoben, nicht durch Auftrennen der Union** (2026-07-27). `UnsubscribeFunc = () => void`. Die Felder `.listener` / `.listeners` entfallen ersatzlos, statt pro Overload-Arm typisiert zu werden. Begründung: die einzige konsumentenförmige Verwendung (`off(ε, unsub.listener)`) ist gegenüber `unsub()` redundant — sie kann nichts, was der Handle-Aufruf nicht kann, und braucht zusätzlich den Emitter im Scope. Alle übrigen Lesestellen im Repo sind White-Box-Assertions der eigenen Specs. Die Empfehlung des Audits (Rückgabetyp pro Overload-Arm) hätte das Traversieren in den `EventListener` erstmals legalisiert und damit supportpflichtig gemacht.
- **`export type {EventListener}` in `src/index.ts:14` fällt mit** (2026-07-27). Sein einziger dokumentierter Zweck (CHANGELOG.md:147) war der Zugriff auf genau diese Felder.
- **TYPE-003 folgt der Empfehlung des Audits** (2026-07-27): `Promise<any[] | undefined>`.
- **Semver: minor** (2026-07-27). Beide Findings sind Typbrüche. Der Lauf bleibt trotzdem minor, aus dem in `CHANGELOG.md` unter `v6.2.0` festgehaltenen Grund — es wurde nie ein `6.x` veröffentlicht. Vor dem Abschluss erneut gegen `npm view @spearwolf/eventize dist-tags` prüfen; steht dort inzwischen ein 6.x, wird daraus ein Major.
- **Kein Subagent** (2026-07-27). Die Session-Anweisung verbietet den Agent-Tool-Einsatz ohne ausdrücklichen Auftrag; der Orchestrator schreibt hier selbst. Verify- und Commit-Regeln des Skills bleiben unverändert.

## Vorbestehende Fehler

Keine. Die Baseline ist auf ganzer Breite grün — jeder rote Lauf ab hier gehört dem laufenden Paket.

## Pakete

### [x] 1. `UnsubscribeFunc` auf `() => void` reduzieren (API-001)

- Findings: API-001
- Ziel: Das Unsubscribe-Handle ist eine reine Funktion; der interne `EventListener` ist von der öffentlichen Oberfläche aus weder erreichbar noch nennbar.
- Dateien: `src/types.ts`, `src/eventize-api.ts`, `src/index.ts`, `src/lifecycle.spec.ts`, `src/off.spec.ts`, `src/once.spec.ts`, `docs/lifecycle.md`, `docs/off.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/api-details.md`, `skills/using-eventize/references/migration.md`, `AGENTS.md`, `CHANGELOG.md`
- Verify: `npx jest --clearCache && npm run cbt`
- Commit: `feat(api)!: reduce UnsubscribeFunc to a plain function (API-001)`
- Hash: `43f4700`
- **Umfang größer als geplant.** Der Plan nannte 17 Zugriffsstellen; tatsächlich waren es 87 Suppressions über fünf Spec-Dateien. `on.spec.ts` prüft die gesamte Overload-Dekodierung über `unsubscribe.listener.priority` / `.eventName` / `.isCatchEmAll` — 82 `@ts-expect-error` allein dort, im ersten Grep nicht sichtbar, weil sie ein anderes Muster nutzen als die `as any`-Stellen. Gelöst mit `src/__test-utils__/listeners.ts` statt mit Einzelumbauten.

**API-001 · medium · src/types.ts:126-128** — `UnsubscribeFunc` blockiert den dokumentierten Zugriff auf `.listener` / `.listeners`

Der Typ ist eine Union aus `(() => void) & {listener: EventListener}` und `(() => void) & {listeners: EventListener[]}`. TypeScript kann nicht entscheiden, welcher Arm vorliegt, also ist jeder Zugriff auf `.listener` oder `.listeners` ein TS2339 — in dieser Session gegen `src/index.ts` reproduziert, laut Audit ebenso gegen die veröffentlichte `lib/index.d.ts`. Genau dieser Zugriff steht in `docs/lifecycle.md:126,132,165`, `references/migration.md:26,35` und `references/api-details.md:100`. Die eigene Testsuite umgeht ihn siebzehnmal mit `as any`.

Umsetzungsschritte:

1. `src/types.ts:126-128` → `export type UnsubscribeFunc = () => void;`. Den dadurch ungenutzten `import type {EventListener}` in Zeile 2 entfernen, sonst schlägt Lint an.
2. `src/eventize-api.ts:55-70` — `makeUnsubscribe()` gibt `unsubscribe` direkt zurück; das `Object.assign` mit `{listener}` / `{listeners}` entfällt. Der Kommentarblock ab Zeile 45 und der Kommentar bei Zeile 450 beschreiben die entfallenden Felder und werden auf den neuen Stand gezogen.
3. `src/index.ts:14` — `export type {EventListener} from './EventListener';` streichen.
4. Specs: die siebzehn `as any`-Zugriffe verlieren ihre Grundlage. Wo eine Assertion echtes Verhalten pinnt — `detach()` nullt `listener` / `listenerObject` / `callAfterApply` und setzt `isRemoved` —, wird der `EventListener` künftig über `obj[NAMESPACE].store.getListenersForEventName(name)` geholt; das Muster steht bereits in `src/lifecycle.spec.ts:597` und `src/EventListener.spec.ts:113`. Betroffen: `lifecycle.spec.ts` (345-353, 380-386, 402, 410-426, 439-466, 530-545, 552-591), `off.spec.ts` (996-1010, 1084-1119), `once.spec.ts` (167-200).
5. `once.spec.ts:167-182` dreht sich um: statt `Object.keys(unsubscribe)` gleich `['listener']` / `['listeners']` wird gepinnt, dass das Handle **keine** aufzählbaren Eigenschaften trägt. Das ist der neue Regressionstest für API-001.
6. `once.spec.ts:184` (`off(ε, unsubscribe.listener)`) bleibt inhaltlich erhalten, holt die Instanz aber aus dem Store — `off()` nimmt `listener: unknown` und akzeptiert eine `EventListener`-Instanz weiterhin, nur der Weg über das Handle entfällt.
7. `off.spec.ts:1001` — das `@ts-expect-error` verschwindet mit dem Zugriff; die Instanz kommt aus dem Store, `.id` bleibt prüfbar.
8. Doku: `docs/lifecycle.md` (11 Treffer, darunter der Abschnitt ab Zeile 226 zur Handle-Semantik und die Migrationsnotiz in 165-166), `docs/off.md:206` und die Tabelle darüber, `references/api-details.md`, `references/migration.md`, `SKILL.md`. `AGENTS.md:56` (die Notiz zum bewusst nicht genullten `listeners`-Capture) und `AGENTS.md:58` (dts-Asymmetrie) werden nachgezogen.
9. Nach dem Build prüfen, ob `lib/index.d.ts` `EventListener` noch im Wertnamensraum exportiert. Fällt die Erreichbarkeit über `UnsubscribeFunc` und der direkte Re-Export gemeinsam weg, löst sich die in `AGENTS.md:58` beschriebene Asymmetrie auf — dann wird die Notiz gestrichen statt korrigiert. Das Ergebnis kommt ins CHANGELOG, in beide Richtungen.
10. `CHANGELOG.md` unter `## Unreleased`: BREAKING (types), mit Migrationsweg `unsub.listener → unsub()`.

### [x] 2. `emitAsync()` auf seinen tatsächlichen Rückgabetyp verengen (TYPE-003)

- Findings: TYPE-003
- Ziel: Der deklarierte Rückgabetyp gibt den `undefined`-Fall weiter, statt ihn hinter `any` verschwinden zu lassen.
- Dateien: `src/eventize-api.ts`, `src/types.ts`, ggf. betroffene Specs, `CHANGELOG.md`
- Verify: `npm run typecheck && npm test -- src/emitAsync.spec.ts` als schnelle Schleife, danach `npx jest --clearCache && npm run cbt`
- Commit: `feat(api)!: narrow emitAsync() to Promise<any[] | undefined> (TYPE-003)`
- Hash: `f4a42dd`
- Der schmalere Typ fand sofort eine eigene Ungenauigkeit: der leere Zweig gab `Promise.resolve()` zurück — `Promise<void>`, nicht `Promise<undefined>`. Gleicher Laufzeitwert, aber der Compiler wies es zurück.

**TYPE-003 · low · src/eventize-api.ts:617,625,630,636; src/types.ts:296-298** — `emitAsync()` ist als `Promise<any>` deklariert, obwohl die Laufzeit enger ist

Alle drei Overloads und die Implementierung geben `Promise<any>` zurück. Tatsächlich liefert die Funktion `Promise<any[]>`, wenn mindestens ein Listener einen Nicht-Nullwert zurückgab, sonst `Promise<undefined>` (`eventize-api.ts:649`). `any` schaltet jede Weiterprüfung ab — `(await emitAsync(ε, 'x')).map(…)` kompiliert anstandslos, obwohl der Wert `undefined` sein kann, und genau das ist der dokumentierte Quirk. `SKILL.md:47` nennt bereits korrekt `Promise<any[] | undefined>`.

Umsetzungsschritte:

1. `src/eventize-api.ts` — die drei Overloads (617, 625, 630) und die Implementierung (636) auf `Promise<any[] | undefined>`.
2. `src/types.ts:296-298` — beide `emitAsync`-Signaturen der Objekt-Oberfläche gleichziehen.
3. Löst der schmalere Typ in Specs Fehler aus (`emitAsync.spec.ts`, `api-surfaces.spec.ts`), sind das genau die Aufrufer, die der Quirk trifft — im Test explizit behandeln, nicht wegcasten.
4. Ein Spec-Fall, der den `undefined`-Zweig typseitig pinnt, falls noch keiner existiert.
5. `CHANGELOG.md` unter `## Unreleased`: BREAKING (types), kein Laufzeitverhalten betroffen. `SKILL.md:47` stimmt bereits und bleibt unangetastet.

## Abschluss

**Ergebnis:** 2 Findings, 2 Pakete, 2 Commits plus Abschluss-Commit. Kein Paket blockiert, kein Stash. Voller `cbt` grün nach geleertem ts-jest-Cache: 29 Suiten / 678 Fälle (Baseline 29 / 677), Coverage 99.82 / 98.01 / 99.23 / 100, `attw` 4/4, `typecheck` Exit 0.

**Coverage:** Branch-Deckung 98.02 → 98.01, eine Hundertstelstelle, weil die vollständig gedeckte `Array.isArray(listeners) ? … : …`-Verzweigung in `makeUnsubscribe()` ersatzlos entfiel. `coverageThreshold` bleibt bei 97.5 — nicht gesenkt, nicht angehoben.

**Semver: `6.2.0` → `6.3.0`, Minor trotz eines entfernten Exports und zweier verschärfter Typen.** Nach der Bewertungstabelle wäre das dreimal Major. Es bleibt Minor aus dem Grund, den `v6.1.0` etabliert und `v6.2.0` fortgeschrieben hat, für diesen Lauf erneut verifiziert: `npm view @spearwolf/eventize dist-tags` liefert `latest: 5.1.0`, kein einziges 6.x steht in der Registry. Der Sprung, den ein Konsument tatsächlich nimmt, ist `5 → 6`, und er nimmt ihn einmal. **Damit ist die dritte offene Frage des Audits beantwortet — allerdings zum letzten Mal: sobald ein 6.x veröffentlicht ist, kostet der nächste Bruch eine 7.0.0.**

**Nebenbefunde, bewusst nicht Teil dieses Laufs:**

1. **`makeUnsubscribe()` könnte den `listeners`-Capture jetzt nullen.** Vor v6.3.0 hätte das nichts freigegeben, weil das Handle dieselben Referenzen als `.listener` / `.listeners` trug. Jetzt ist der Capture die einzige Referenz, die ein verbrauchtes Handle noch hält — Nullen nach dem `off()`-Aufruf würde den letzten Weg kappen, auf dem ein verbrauchtes Handle einen registrierten Listener und damit womöglich den Emitter hält. Das ist eine Änderung an Objektlebensdauern, braucht eigene `WeakRef`-Fälle und einen CHANGELOG-Eintrag, und berührt MEM-002. Gehört ins nächste Audit, nicht in diesen Lauf.
2. **`on.spec.ts` trägt noch 21 `@ts-expect-error`**, die nichts mit API-001 zu tun haben: sie unterdrücken `this`-Zuweisungen in Listener-Rümpfen. Mit typisierten Listener-Fixtures wären sie ablösbar.
3. **`Priority.Default` ist deprecated** und wird in `src/documented-quirks.spec.ts:64` weiter benutzt.

**Nicht angefasst:** `audit.html`. Die Verifikation der behobenen Findings gehört in einen Folgelauf von `js-ts-project-audit`.

## Danach (nicht Teil dieses Plans)

Der Nutzer hat einen anschließenden Scan der gesamten öffentlichen Oberfläche angefordert: welche internen Typen nach außen gereicht werden, wo ein Konsument eine Typumwandlung braucht, und wo die Bibliothek intern mit `any`-Casts statt expliziter Typen arbeitet. Das Ergebnis ist ein Befund, kein Fix — was er findet, geht ins nächste Audit, nicht in diesen Lauf.
