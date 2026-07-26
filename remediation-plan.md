# Remediation-Plan — @spearwolf/eventize

Quelle: ./audit.html vom 2026-07-26 (Score 77.5) · Branch: `main` · erstellt: 2026-07-26
Baseline: build ✓ · checkPkgTypes ✓ · test 28 Suiten / 642 Tests ✓ · lint ✓ · format ✓ · `tsc --noEmit -p tsconfig.json` ✓ (Exit 0, ts-jest-Cache vorher geleert)
Scope: 8 von 20 Findings, vom Nutzer namentlich benannt (2 high, 2 medium, 4 low) · 5 Pakete
Ausgenommen: DX-002, DX-003, TEST-002, CI-001, CI-002, DEP-001, DEP-002, INFO-001…005 — nicht angefordert, bleiben für das nächste Audit liegen.

## Vorbestehende Fehler

Keine. Die Baseline ist auf ganzer Breite grün — jeder rote Lauf ab hier gehört dem laufenden Paket.

## Entscheidungen

- **Ein unbrauchbarer Listener wirft** (2026-07-26). Die offene Frage des Reports ist zugunsten von »werfen« entschieden: `on(ε, 'foo', 5)` schlägt künftig fehl wie `on(ε, 'foo', 0)` heute schon. Breaking Change, gehört in die CHANGELOG-Bruchliste. Betrifft BUG-005.
- **Eine NaN-Priorität wirft ebenfalls** (2026-07-26). Das Audit empfahl primär den stillen Fallback auf `Priority.Normal`, nannte »werfen« aber als Alternative unter der Bedingung »mit demselben Argument wie bei BUG-005 und im selben Durchgang« — genau der vorliegende Fall. Betrifft BUG-006.
- **`Number.isFinite()` ist die falsche Prüfung** (2026-07-26, aus dem Code verifiziert). `Priority.Max` ist `Number.POSITIVE_INFINITY`, `Priority.Min` ist `Number.NEGATIVE_INFINITY` (`src/Priority.ts:4,10`). Die im Audit-Text zu BUG-006 vorgeschlagene `Number.isFinite`-Prüfung würde beide zurückweisen und damit dokumentierte API brechen — der Fließtext desselben Findings verlangt ausdrücklich das Gegenteil (»Priority.Max und Priority.Min bleiben unangetastet«). Die Prüfung muss NaN-spezifisch sein (`Number.isNaN`), nicht Endlichkeits-basiert.
- **`include: ["src"]`, `moduleResolution: "bundler"`** (2026-07-26, aus dem Audit übernommen). Nicht `nodenext`, weil das Dateierweiterungen an relativen Imports verlangte und die in AGENTS.md festgeschriebene Konvention bräche.

## Abschluss

**Ergebnis:** 8 Findings, 5 Pakete, 5 Commits plus Abschluss-Commit. Kein Paket blockiert, kein Stash. Voller `cbt` grün: 29 Suiten / 677 Tests (Baseline 28 / 642), Coverage 99.82 / 98.02 / 99.23 / 100, `attw` 4/4, `typecheck` Exit 0. Branch-Deckung 97.63 → 98.02, `coverageThreshold.branches` 97 → 97.5 **angehoben**, nie gesenkt.

**Semver: `6.1.0` → `6.2.0`, Minor trotz zweier Breaking Changes.** Die Oberfläche trägt zwei Brüche (`on()`/`once()` weisen unbrauchbare Listener und NaN-Prioritäten werfend zurück, wo sie vorher still registrierten) — nach strenger Semver ein Major. Verifiziert, was dagegen steht: `npm view @spearwolf/eventize dist-tags` liefert `latest: 5.1.0`, in der Registry endet alles bei `5.1.0`, **kein einziges 6.x wurde je veröffentlicht**; lokal getaggt ist nur `v6.0.0`, `v6.1.0` existiert allein in `package.json` und im CHANGELOG. Der Major-Sprung, den ein Konsument tatsächlich nimmt, ist `5 → 6`, und er bekommt v6.0.0s neun Brüche, v6.1.0s zwei und diese beiden in einem Install. Innerhalb von 6.x kann niemand brechen, weil nie ein 6.x ausgeliefert wurde. Dasselbe Argument hat das Projekt für `v6.1.0` schon einmal schriftlich geführt; es steht jetzt im Header von `v6.2.0`. **Wird ein 6.x veröffentlicht, bevor die nächsten Brüche landen, gilt dieses Argument nicht mehr** — dann ist der nächste Bruch ein Major.

**Was im Abschluss nachgezogen wurde:** die fünf `## Unreleased`-Einträge zu `## v6.2.0` konsolidiert, ein Docs-Eintrag für den `once()`-Pin ergänzt, die Versionsanker gesetzt, die frühere Pakete bewusst offengelassen hatten (`docs/lifecycle.md:5`, `SKILL.md` Pitfall 12, `api-details.md`, zwei README-Absätze), `package-lock.json` von `6.0.0` nachgezogen, und zwei Rückverweise in den Abschnitten `v6.0.0` und `v6.1.0` entschärft, die auf `v6.1.0` als »das erste 6.x, das ein Konsument sieht« zeigten — jetzt versionsnummernfrei formuliert, damit die nächste Anhebung sie nicht wieder bricht. Der fehlende `off(ε, '*', listenerObject)`-Eintrag in `migration.md` ist ergänzt statt die Zählung gesenkt.

**Nicht angefasst:** `audit.html`. Wer sich selbst benotet, hat immer bestanden — die Verifikation der behobenen Findings gehört in einen Folgelauf von `js-ts-project-audit`.

### Nebenbefunde für das nächste Audit

Während der Umsetzung aufgefallen, bewusst außerhalb dieses Laufs gehalten:

1. **`findSimilarListener()` lässt `on()` auf eine fremde `once()`-Registrierung aufsatteln**, obwohl beide verschiedene Lebensdauern haben: das verbrauchte `on()`-Handle senkt einen Zähler, dessen Freigabelogik einem nie aufgerufenen fremden Handle gehört. Folge ist der einzige verbliebene Weg, auf dem ein verbrauchtes Handle den Emitter noch hält. Verhaltensänderung; der Pin in `src/lifecycle.spec.ts` fällt laut um, sollte ihn jemand beiläufig einbauen.
2. **`tsconfig.json` setzt kein `noEmit`** — das Flag sitzt allein im `typecheck`-Skript. Ein `npx tsc -p tsconfig.json` ohne Flag schreibt `.js` neben jede Quelldatei unter `src/`. Im Review zweimal versehentlich ausgelöst.
3. **`hasConsole` in `utils.ts`** hat nach Paket 4 außerhalb des eigenen Moduls keinen Verwender mehr, bleibt aber exportiert.
4. **`migration.md:64`** verspricht »Worked before/after snippets for the four runtime changes« in `docs/lifecycle.md`; dort stehen drei. Vorbestehend.
5. **`npm run format:check` deckt nur `src/**` ab.** Sämtliche Markdown-Änderungen dieses Laufs — CHANGELOG, README, `docs/`, `skills/` — laufen durch kein Format-Gate.
6. **`coverageThreshold` hinkt der Deckung hinterher**: gemessen 99.82 / 98.02 / 99.23 / 100 gegen Schwellen 99 / 97.5 / 99 / 99. `AGENTS.md` verlangt, die Zahlen anzuheben, wenn die Deckung steigt.
7. **`SKILL.md` Pitfall 5** nennt für werfende Listener nur die `on()`-Seite; die `once()`-Konsequenz steht seit diesem Lauf in `docs/lifecycle.md`.
8. Vorbestehend ungedeckte Zweige, alle außerhalb des Scopes: `EventListener.ts:186,217`, `EventStore.ts:251`, `getSubscriptionCount.ts:10`, `utils.ts:61-62`.

## Pakete

### [x] 1. Typprüfung ins Gate holen und tsconfig schärfen

- Findings: BUILD-001, BUILD-002, TYPE-002
- Ziel: `cbt` prüft Typen cache-unabhängig, und zwar genau die Dateien unter `src/` unter dem Auflösungsverfahren, unter dem das Paket konsumiert wird.
- Dateien: `tsconfig.json`, `package.json`, `AGENTS.md`, `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npx jest --clearCache && npm run cbt`
- Commit: `build(ts): add a cache-independent typecheck to cbt and tighten tsconfig (BUILD-001, BUILD-002, TYPE-002)`
- Hash: `4cda1ae`

**Verlauf.** Alle drei Findings vom Reviewer als behoben bestätigt, `cbt` grün (28 Suiten / 642 Tests, Coverage unverändert 99.82/97.63/99.21/100, attw 4/4). Eine Runde war nötig — nicht wegen des Codes, sondern wegen einer falsch attribuierten Begründung.

Die im Plan befürchtete TS5095-Kollision tritt **nicht** ein, aber aus einem anderen Grund als der Implementierer zunächst annahm. Verifiziert von beiden Seiten an `node_modules/ts-jest/dist/legacy/compiler/ts-compiler.js`: ts-jest erzwingt auf dem Nicht-ESM-Pfad `module: commonjs` sehr wohl bedingungslos (Zeile 143, unabhängig vom tsconfig-Wert); die Entschärfung liegt eine Ebene tiefer in `resolveCompatibleModuleResolution()` (Zeile 202-217), die erkennt, dass `bundler` mit `commonjs` unter TypeScript < 6 ungültig wäre, und für den Testlauf still auf `node10` zurückfällt (ts-jest#4198). **Konsequenz:** `typecheck` und der Testlauf kompilieren dieselben Dateien unter unterschiedlicher Modulauflösung. Dass beide übereinstimmen, ist ein Zufall der ausschließlich relativen, erweiterungsfreien Importe — per `tsc --traceResolution` gegen beide Verfahren empirisch bestätigt, die Traces für alle `src/`-Importe sind byte-identisch (Abweichungen nur bei bare specifiers wie `tslib`). Ein `nodenext`-Subpath-Import oder ein `paths`-Remap würde das brechen. Als Absatz in `AGENTS.md`, `## Verification`, festgehalten.

**Nebenbefund (nicht Teil dieses Laufs).** `tsconfig.json` setzt kein `noEmit`; das Flag sitzt allein im `typecheck`-Skript. Ein `npx tsc -p tsconfig.json` ohne Flag schreibt darum `.js` neben jede `.ts`-Datei unter `src/` — im Review einmal versehentlich ausgelöst und wieder aufgeräumt. Kandidat für das nächste Audit.

Reihenfolge: erst BUILD-001, dann BUILD-002, dann TYPE-002 — sonst prüft der neue Schritt die falschen Dateien unter dem falschen Verfahren.

**Bekannte Kollisionsgefahr, vorher prüfen.** `jest.config.ts` konfiguriert ts-jest mit `tsconfig: './tsconfig.json'`, und ts-jest erzwingt auf seinem CJS-Pfad `module: 'commonjs'` — das ist im Vorlauf dieses Projekts bereits aufgeschlagen und hat `verbatimModuleSyntax` unmöglich gemacht (siehe `CHANGELOG.md`, `v6.1.0`). `moduleResolution: 'bundler'` ist unter `module: 'commonjs'` **kein gültiger Wert** (TS5095). Trifft das zu, ist der Ausweg ein eigener `tsconfig`-Override für ts-jest in `jest.config.ts` (`module: 'commonjs'` + `moduleResolution: 'node'` nur für den Testpfad), damit `tsconfig.json` selbst sagen darf, was für die Produktion gilt. Nicht raten — erst reproduzieren, dann entscheiden, und den Befund im Report nennen.

Die beiden neuen Flags aus TYPE-002 gelten über denselben Weg auch für die Kompilierung der Spec-Dateien. Das ist gewollt und laut Audit heute kostenlos, muss aber im Verify sichtbar sein — deshalb `--clearCache` davor. `jest.config.ts` selbst bleibt außerhalb von `include`; ts-jest kompiliert es über seinen eigenen Pfad und braucht keinen Eintrag.

Kein CHANGELOG-Bruchvermerk nötig — an der Laufzeit ändert sich nichts. Ein kurzer Eintrag unter `## Unreleased` genügt, im Ton der vorhandenen Einträge. Den `cbt`-Absatz in `AGENTS.md` nachziehen: er behauptet die cache-unabhängige Typprüfung heute schon, künftig darf er es.

**BUILD-001 · medium · tsconfig.json:1-31** — tsconfig ohne include/exclude, moduleResolution fällt auf classic

Weiterhin belegt: `tsc --showConfig` meldet `moduleResolution: 'classic'` und `module: 'es6'`, weil beide Optionen ungesetzt sind. 'classic' ist TypeScripts Verfahren aus der Zeit vor Node — es modelliert nicht, wie dieses Paket tatsächlich aufgelöst wird, weder von einem Bundler noch von Nodes ESM-Loader. Dass heute nichts bricht, liegt allein daran, dass jeder Import in `src/` relativ und ohne Erweiterung ist; TypeScript selbst weist im Fehlerfall darauf hin ('Did you mean to set the moduleResolution option to nodenext?'). Ohne `include`/`exclude` zieht `tsc` außerdem alles unter dem Projekt-Root ein: `tsc --listFilesOnly` zeigt `jest.config.ts` und die beiden generierten `lib/index.d.*ts` im Programm. Solange kein Script `tsc` aufruft, bleibt das folgenlos — mit BUILD-002 wird es das nicht mehr.

Empfehlung: `"include": ["src"]` setzen sowie `"module": "esnext"` und `"moduleResolution": "bundler"` ergänzen. Beides ist verifiziert: `tsc --noEmit -p tsconfig.json --module esnext --moduleResolution bundler` läuft heute fehlerfrei. 'bundler', nicht 'nodenext' — letzteres verlangt Dateierweiterungen an relativen Imports und widerspräche damit der in AGENTS.md festgeschriebenen Konvention 'Relative imports carry no extension'. `jest.config.ts` bleibt außerhalb von `include`; ts-jest kompiliert es über seinen eigenen Pfad.

**BUILD-002 · high · package.json:47, tsup.config.js:1-21** — cbt enthält keine cache-unabhängige Typprüfung

AGENTS.md nennt `cbt` 'the only gate that catches dual-format type breakage' und schildert einen Vorfall, in dem ein grünes `cbt` eine Änderung durchgelassen hat, die 13 von 25 Spec-Suiten brach — überlebt hat der Fehler im ts-jest-Cache unter `/tmp/jest_rs`, den `npm run clean` nicht anfasst. Der Negativtest dieses Laufs zeigt, dass das Gate diese Klasse gar nicht abdeckt: ein absichtliches `export const __typeError: number = "definitely a string"` in `src/utils.ts` hat `npm run build` vollständig fehlerfrei passiert — ESM-Bundle, CJS-Bundle und der DTS-Rollup, Exit 0. esbuild typprüft nicht, tsups dts-Pass ebenso wenig, und `attw --pack` prüft die bereits emittierten Deklarationen auf Auflösbarkeit, nicht den Quelltext. Damit ist die einzige Typprüfung der gesamten Kette die von ts-jest, durch exakt den Cache, vor dem dieselbe Datei warnt. Auf einem frischen CI-Runner greift sie; lokal, wo die Warnung gebraucht wird, ist sie ungedeckt.

Empfehlung: Ein Script `"typecheck": "tsc --noEmit"` anlegen und in die `cbt`-Kette aufnehmen, sinnvollerweise zwischen `build` und `checkPkgTypes`. `tsc --noEmit -p tsconfig.json` läuft heute fehlerfrei durch, die Aufnahme kostet also nichts außer Laufzeit und ist gegen den ts-jest-Cache immun. Zusammen mit BUILD-001 umsetzen: erst include/exclude und moduleResolution korrigieren, damit der neue Schritt genau die Dateien prüft, die er prüfen soll, und unter dem Auflösungsverfahren, unter dem das Paket tatsächlich konsumiert wird. Danach den Absatz in AGENTS.md nachziehen, der `cbt` beschreibt — er darf dann sagen, was er heute schon behauptet.

**TYPE-002 · low · tsconfig.json:2-30** — exactOptionalPropertyTypes und isolatedModules sind aus, obwohl beide heute fehlerfrei durchlaufen

Die tsconfig ist mit `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals` und `noImplicitOverride` überdurchschnittlich streng — zwei naheliegende Flags fehlen. Verifiziert mit je einem eigenen Lauf: `tsc --noEmit -p tsconfig.json --exactOptionalPropertyTypes` endet mit Exit 0, dasselbe mit `--isolatedModules`. Beide sind heute also kostenlos zu haben. `exactOptionalPropertyTypes` ist inhaltlich relevant, weil `OnceAsyncOptions.signal` optional ist und die Implementierung in `eventize-api.ts:480-504` sorgfältig zwischen 'nicht übergeben' und 'übergeben, aber nullish' unterscheidet — genau die Trennung, die das Flag im Typsystem erzwingt. `isolatedModules` spiegelt, dass esbuild jede Datei einzeln transpiliert, und fängt Re-Export-Muster ab, die tsup still falsch emittieren könnte.

Empfehlung: Beide Flags in `tsconfig.json` auf `true` setzen; ein Codewechsel ist nicht nötig, die Läufe oben sind der Beleg. Sinnvoll im selben Commit wie BUILD-001 und BUILD-002, weil erst der dort eingeführte `typecheck`-Schritt dafür sorgt, dass ein späterer Verstoß auch auffällt — heute würde ein Bruch dieser Flags nur über ts-jest sichtbar.

---

### [x] 2. once() mit werfendem Listener festnageln

- Findings: TEST-003
- Ziel: Das tragende, aber ungeprüfte Verhalten »ein werfender `once()`-Listener bleibt abonniert« bekommt Specs und einen Satz in der Doku.
- Dateien: `src/emit-throwing-listener.spec.ts`, `docs/lifecycle.md`
- Modell: mittlere Stufe
- Verify: `npm test -- src/emit-throwing-listener.spec.ts && npm run lint && npm run format:check`
- Commit: `test(once): pin that a throwing once() listener stays subscribed (TEST-003)`
- Hash: `e1211e5`

**Verlauf.** Eine Runde, kein Befund. Verhalten exakt wie im Finding beschrieben, kein Produktivcode angefasst. Zwei Fälle in `describe('once() with a throwing listener', …)`: der werfende Listener bleibt abonniert und feuert erneut (`getSubscriptionCount(ε)` bleibt 1), und derselbe Listener wird nach einem wurffreien Dispatch korrekt freigegeben (Zähler auf 0, weiterer Emit erreicht ihn nicht mehr). Der Reviewer hat gegengeprüft, dass beide Assertions bei der naheliegenden Regression — `callAfterApply()` in ein `try/finally` zu ziehen — tatsächlich rot würden, statt danebenzustehen. Doku-Satz sitzt im bestehenden Block in `docs/lifecycle.md`.

Reines Festnageln, **kein Codewechsel**. Zeigt sich beim Schreiben der Specs ein anderes Verhalten als beschrieben, ist das ein Fund für das nächste Audit und kein Anlass, hier Produktivcode anzufassen — dann Paket blockieren und berichten.

**TEST-003 · low · src/emit-throwing-listener.spec.ts:1-108, src/EventListener.ts:191-197** — once() mit werfendem Listener ist von keinem Spec festgenagelt

`emit-throwing-listener.spec.ts` deckt fünf Fälle für `emit()` und zwei für `emitAsync()` ab, aber ausschließlich mit `on()`. Für `once()` gilt: `callAfterApply()` läuft in `EventListener.apply()` erst nach dem apply-Aufruf, also nie, wenn der Listener wirft. Sonde: ein werfender `once()`-Listener bleibt abonniert und feuert beim nächsten `emit()` erneut — nach zwei Emits stehen zwei Aufrufe und eine weiterhin lebende Subscription. Das ist eine plausible Folge aus 'released only when the dispatch actually called something' (`docs/lifecycle.md:262`), aber der dort beschriebene Fall ist der Dispatch, der nichts fand, nicht der, der etwas fand und explodierte. Es ist außerdem die Konstellation, in der ein one-shot ohne aufbewahrtes Handle dauerhaft hängen bleibt.

Empfehlung: Zwei Fälle in `emit-throwing-listener.spec.ts` ergänzen: ein `once()`-Listener, der wirft, bleibt abonniert und feuert erneut; derselbe Listener, der beim zweiten Mal nicht wirft, wird dann korrekt abgemeldet. Dazu ein Satz in `docs/lifecycle.md` im bestehenden 'A once() releases itself only when the dispatch actually called something'-Block, der die werfende Variante ausdrücklich einschließt. Kein Codewechsel — das Verhalten ist tragend, nur ungeprüft.

---

### [x] 3. Verbrauchtes Unsubscribe-Handle gibt den Emitter frei

- Findings: MEM-001
- Ziel: Ein aufbewahrtes, bereits aufgerufenes Handle hält weder Emitter noch `EventStore`, `EventKeeper` oder retained Payloads am Leben.
- Dateien: `src/eventize-api.ts`, `src/lifecycle.spec.ts`, ggf. `package.json` und `.github/workflows/*` (Test-Kommando mit `--expose-gc`), `docs/lifecycle.md`, `CHANGELOG.md`
- Modell: stärkste Stufe
- Verify: `npm test -- src/lifecycle.spec.ts && npm test && npm run typecheck && npm run lint && npm run format:check`
- Commit: `fix(api): release the emitter when a consumed unsubscribe handle is kept (MEM-001)`
- Hash: `23ae941`

**Verlauf.** Zwei Runden. Roter Lauf vor dem Fix nachgewiesen: zwei GC-Assertionen fallen, die Kontrollgruppe bleibt im selben Lauf grün. Der Reviewer hat gegengeprüft, indem er den Fix in einer Scratchpad-Kopie zurückdrehte — dieselben Fälle fallen, die übrigen 36 nicht. Suite 642 → 649 Tests, `cbt` grün, `eventize-api.ts` 100 % in allen vier Spalten.

**Der Fix.** `makeUnsubscribe()` führte den Consumed-Zustand in einem separaten `let isConsumed`; `host` blieb dadurch für die Lebensdauer des Handles in der Closure. Jetzt ist das Capture selbst der Flag: `heldHost` wird beim ersten Aufruf genullt, der Null-Test ersetzt den Boolean. `heldListeners` fiel ganz weg — sein Nullen hätte nie etwas freigegeben, weil `Object.assign` dieselben Referenzen als `.listener`/`.listeners` auf das Handle legt. Single-Shot-Garantie intakt, per Spec über Reference Counting, Multi-Event-Handle und doppelt aufgerufenes `once()`-Handle bestätigt.

**Abweichung 1 — `--expose-gc` nicht am Testkommando, sondern zur Laufzeit.** `src/__test-utils__/gc.ts` beschafft den Collector über `v8.setFlagsFromString('--expose-gc')` + `vm.runInNewContext('gc')` und setzt die Flag zurück. Der im Plan vorgesehene Weg wäre **nicht bloß umständlich, sondern kaputt gewesen**: `NODE_OPTIONS=--expose-gc` lässt Node 18 gar nicht erst starten (`--expose-gc is not allowed in NODE_OPTIONS`), und 18 steht in beiden Workflow-Matrizen und in `engines`. Die Laufzeit-Variante braucht null Änderungen an `package.json` und `.github/` und kann nicht still überspringen — schlägt die Beschaffung fehl, wirft der Import und die Suite fällt laut um. Gegen Node 18/20/22/24/25.9 verifiziert.

**Abweichung 2 — die naheliegende GC-Schleife wäre falsch gewesen.** `gc(); await; deref()` ist innerhalb eines Jobs immer rot, auch für ein frisch weggeworfenes Objekt ohne Bibliotheksbezug: `new WeakRef(t)` und `t.deref()` legen den Referenten in die »kept objects«-Menge des laufenden Jobs. Richtig ist `await` → `gc()` → `deref()`. Steht als Kommentar in `gc.ts`, samt Node-Caveat zu `setFlagsFromString`.

**Doku-Korrektur, die über MEM-001 hinausgeht.** Die Zusage »ein verbrauchtes Handle hält nichts mehr« war auch nach dem Fix zu breit. Der Emitter geht beim ersten Aufruf immer — die Listener-Referenzen erst, wenn der Listener den Store tatsächlich verlässt. Und es gibt zwei Formen, in denen der überlebende Listener zum Emitter zurückführt: sein `callAfterApply` (die Closure eines nie aufgerufenen `once()`-Handles, auf das ein späteres `on()` dedupt hat), oder ein Listener-Objekt, das der Emitter selbst ist — in allen drei dedup-fähigen Schreibweisen `on(ε, 'foo', ε)`, `on(ε, 'foo', 'method', ε)` und `on(ε, ε)`. Der Rückweg sitzt je nach Form in `.listener.listener` **oder** `.listener.listenerObject`. `on(ε, 'foo', fn, ε)` ist dagegen harmlos: Funktionslistener deduppen nie. Ein gewöhnliches `refCount`-2-Paar gibt den Emitter sehr wohl frei — es liegt nicht am Zähler, sondern daran, worauf der überlebende Listener zeigt. Als `WARNING`-Block in `docs/lifecycle.md` mit dem Ausweg `off(ε, listenerObject)`, in `AGENTS.md` und im CHANGELOG unter »What this does not claim«. Ein Ist-Pin hält beide Seiten in einem Fall.

**Nebenbefund (nicht Teil dieses Laufs).** `findSimilarListener()` lässt ein `on()` auf eine fremde `once()`-Registrierung aufsatteln, obwohl beide verschiedene Lebensdauern haben: das verbrauchte `on()`-Handle senkt einen Zähler, dessen Freigabelogik einem nie aufgerufenen fremden Handle gehört. Der Vollfix — Listener mit gesetztem `callAfterApply` beim Dedup überspringen — wäre eine Verhaltensänderung und gehört ins nächste Audit. Der neue Pin fällt laut um, sollte ihn jemand beiläufig einbauen; vom Reviewer simuliert und bestätigt.

**Test zuerst.** Der GC-Test wird geschrieben, rot gesehen und erst dann behoben. Ohne rot gesehenen Test weiß niemand, ob er den Fehler überhaupt fängt — bei einer GC-Assertion mit `WeakRef` gilt das doppelt, weil ein falsch aufgesetzter Test aus Zufall grün wird.

Aufbau: Kontrollgruppe (Handle nach Aufruf weggeworfen → Emitter einsammelbar) und Prüfgruppe (Handle aufbewahrt → Emitter muss ebenfalls einsammelbar sein). Dazu die Zweitsonde aus dem Finding: ein retained Payload überlebt heute, obwohl das aufbewahrte Handle zu einem völlig anderen Event gehört.

`global.gc()` braucht `--expose-gc`. Lokal verifiziert: `NODE_OPTIONS=--expose-gc` genügt (Node 25.9). Die CI-Matrix fährt aber 18/20/22/24 — vor dem Commit prüfen, ob `--expose-gc` dort in der NODE_OPTIONS-Allowlist liegt; ist das unklar, die überall tragfähige Form wählen (Jest direkt über `node --expose-gc ./node_modules/jest/bin/jest.js`). Der Test darf **nicht** still übersprungen werden, wenn `global.gc` fehlt — ein Spec, das in CI nichts prüft, ersetzt die Lücke durch eine unsichtbare. Ändert sich das Test-Kommando, beide Workflows unter `.github/` mitziehen.

Die öffentlichen Eigenschaften `.listener` / `.listeners` des Handles bleiben unangetastet — sie sind laut `docs/off.md` Teil der API und zeigen auf entkoppelte `EventListener` ohne Rückverweis auf den Emitter.

`docs/lifecycle.md:226` behauptet das Zielverhalten heute schon; nach dem Fix stimmt der Satz. Prüfen, ob er trotzdem präziser gefasst gehört. CHANGELOG-Eintrag unter `## Unreleased` als **Fix**, kein Bruch.

**MEM-001 · high · src/eventize-api.ts:39-53** — Aufgebrauchtes Unsubscribe-Handle hält den kompletten Emitter fest

`makeUnsubscribe()` schließt über `host` (den Emitter) und `listeners` und gibt beide nach dem Aufruf nie frei — `isConsumed` wird gesetzt, die Referenzen bleiben. Ein GC-Lauf unter `--expose-gc` mit `WeakRef` und Kontrollgruppe zeigt: wird das Handle nach dem Aufruf weggeworfen, ist der Emitter einsammelbar; wird es aufbewahrt, ist er es nicht. Mit ihm hängen `EventStore`, `EventKeeper` und jeder zurückgehaltene Payload fest — eine zweite Sonde belegt, dass ein 8-KB-Puffer unter `retain()` überlebt, obwohl das aufbewahrte Handle zu einem völlig anderen Event gehört. Das widerspricht `docs/lifecycle.md:226` direkt: 'Calling a handle whose listener has actually been removed from the store releases every reference it was holding.' Der `EventListener` selbst wird korrekt entkoppelt — `detach()` nullt seine Felder, und das Listener-Objekt ist nachweislich einsammelbar. Es ist die Closure des Handles, die hält. Die Stelle wiegt schwer, weil dieselbe Datei das Aufbewahren von Handles als sicheres Muster empfiehlt und der Teardown-Beispielcode in `docs/lifecycle.md` genau ein Array aufbewahrter Handles durchläuft, ohne es zu leeren.

Empfehlung: `host` und `listeners` in `makeUnsubscribe()` nach dem `off()`-Aufruf auf `null` setzen und den `isConsumed`-Test durch einen Null-Test auf `host` ersetzen. Die öffentlichen Eigenschaften `.listener` / `.listeners` bleiben unangetastet — sie zeigen auf entkoppelte `EventListener` ohne Rückverweis auf den Emitter und sind laut `docs/off.md` Teil der API. Dazu eine Assertion in `src/lifecycle.spec.ts`, die mit `WeakRef` und `global.gc()` prüft, dass ein aufbewahrtes, verbrauchtes Handle den Emitter nicht mehr hält (Jest mit `--expose-gc`, alternativ `FinalizationRegistry`). Der Satz in `docs/lifecycle.md:226` stimmt danach — heute stimmt er nicht.

---

### [x] 4. on() weist unbrauchbare Listener und NaN-Prioritäten zurück

- Findings: BUG-005, BUG-006
- Ziel: Was `on()` nicht dispatchen kann, kommt nicht mehr in den Store — es wirft, statt eine tote Subscription anzulegen oder still falsch einzusortieren.
- Dateien: `src/subscribeTo.ts`, `src/EventListener.ts` (nur der Kommentar), die passende Spec-Datei, `skills/using-eventize/references/api-details.md`, `CHANGELOG.md`, ggf. `README.md` / `docs/`
- Modell: stärkste Stufe
- Verify: `npm test && npm run typecheck && npm run lint && npm run format:check`
- Commit: `fix(on): reject unusable listeners and NaN priorities instead of registering them (BUG-005, BUG-006)`
- Hash: `6d2a67d`

**Verlauf.** Zwei Runden. Rote Läufe für beide Findings getrennt nachgewiesen, je 6 rote Fälle, Kontrollgruppen im selben Lauf grün. Suite 649 → 668, Branch-Coverage 97.63 → 98.01, `subscribeTo.ts` auf 100 in allen vier Spalten.

**Der Filter ist nicht zu scharf** — das war hier das teurere Risiko. Der Reviewer hat 44 gültige `on()`-Schreibweisen ausführend gegen den neuen Code geprüft: Funktion, Methodenname als String und als Symbol, Listener-Objekt, Klassen-Instanz, `Object.create(null)`, Array und `Proxy` als Listener-Objekt, Funktion als listenerObject, alle Wildcard- und Positionsvarianten, Tupel mit und ohne Priorität, `once()`, `inject()`, `class Eventize`, Retain-Replay. Neu zurückgewiesen wird exakt {truthy number, boolean, bigint}. `Priority.Max`/`Min`/`Normal`, `0`, die Legacy-Aliase, negative und gebrochene Werte sowie der id-Tiebreak bei zwei `Max` sind ausführend als gültig bestätigt — genau die Fälle, die das im Audit vorgeschlagene `Number.isFinite` gekippt hätte.

**Abweichungen, alle vom Reviewer geprüft und tragfähig:**
1. Der Falsy-Test bleibt **vor** dem Typtest: `!listener || detectListenerType(listener) === undefined`. Ein reiner Typfilter hätte `''` neu *akzeptiert*, weil ein leerer Methodenname einen Tag bekommt, heute aber verworfen wird. So ist die Änderung ausschließlich verschärfend.
2. Der geworfene Text bleibt `subscribeTo() called with insufficient arguments` — er steht so in `api-details.md` und ist für `0` im Listener-Slot schon heute der Wortlaut. Nur das begleitende `console.warn` ist dreiwertig geworden: `null` → »insufficient arguments«, kein Tag → »cannot be a listener«, sonst → »an empty method name«. Der dritte Zweig ist beweisbar nur `''`; `document.all` fällt über `== null` in den ersten.
3. Die Tupel-Zurückweisung ist **atomar** — `on(ε, ['a', ['b', NaN], 'c'], fn)` hinterlässt nichts. Das Audit legt dazu nichts fest; die Entscheidung folgt `retain()`, nicht `emit()`, und steht als Klausel in der Asymmetrieliste von `AGENTS.md`.
4. Die beiden `if (hasConsole)`-Wrapper sind entfernt: `warn` ist in `utils.ts` bereits eine No-op ohne `console`, der Wrapper war ein nie-falscher Branch. Ohne ihn wäre die Branch-Deckung durch den neuen Wurfpfad auf 97.36 gefallen.
5. `coverageThreshold.branches` 97 → 97.5 bei gemessenen 98.01 — **angehoben**, nicht gesenkt, gemäß der Politik im Kommentar von `jest.config.ts`.
6. Ein bestehender Spec in `EventListener.spec.ts` fuhr über `on(obj, 'toFixed', 42 as any)`, also über genau die Eingabe, die jetzt wirft. Er registriert den `EventListener` nun direkt am Store; der geprüfte Dispatch-Pfad ist derselbe. Keine Abschwächung — ein Zählanker und eine Positivkontrolle, die über denselben Pfad `['COLLECTED']` einsammelt, belegen die Nicht-Vakuität im Spec selbst.

**Doku.** Beide Brüche stehen in der CHANGELOG-Bruchliste mit Mechanismus, Blast Radius und Ausweg; dazu README, `docs/lifecycle.md`, `skills/using-eventize/SKILL.md`, `api-details.md` und `migration.md`. Die Upgrade-Pfade zählen jetzt elf statt neun Brüche gegen v5.1.0. Überall, wo der Ausweg `Number.isNaN(p) ? Priority.Normal : p` steht, steht auch, dass ein `[name, priority]`-Tupel den Guard an seinem eigenen zweiten Element braucht. Eine erfundene Versionsnummer `v6.2.0`, die in zwei Skill-Dateien stand und nebenbei eine unbegründete Minor-für-Breaking-Entscheidung mitlieferte, ist restlos raus — die Zielversion wird beim Abschluss bewertet.

**Nebenbefunde (nicht Teil dieses Laufs).**
- `docs/lifecycle.md:5` datiert den beschriebenen Zustand auf v6.1.0. Das stimmt seit diesem Paket nicht mehr und braucht die Zielversion, sobald sie feststeht — **Aufgabe des Abschluss-Commits**, zusammen mit den Versionsankern in `SKILL.md` Punkt 12 und `api-details.md`, die als einzige Pitfalls ohne Anker dastehen.
- `migration.md:64` verspricht »Worked before/after snippets for the four runtime changes« in `lifecycle.md`; dort stehen drei. Die Zahl war schon vor diesem Paket schief. Nächstes Audit.
- `hasConsole` in `utils.ts` hat nach Abweichung 4 außerhalb des eigenen Moduls keinen Verwender mehr, bleibt aber exportiert. Nächstes Audit.
- Vorbestehend ungedeckte Zweige, alle außerhalb dieses Pakets: `EventListener.ts:186,217`, `EventStore.ts:251`, `getSubscriptionCount.ts:10`, `utils.ts:61-62`.

**Test zuerst**, für beide Findings getrennt, jeweils rot gesehen.

Zwei **Breaking Changes**, beide vom Nutzer entschieden (siehe »Entscheidungen«). Beide gehören mit Migrationshinweis in die CHANGELOG-Bruchliste unter `## Unreleased`, im Ton der vorhandenen Einträge — die nennen Mechanismus, Blast Radius und Ausweg.

Zu BUG-005: Der Filter ist `detectListenerType()` — durch darf nur, was einen Tag bekommt (Funktion, String, Symbol, Nicht-Null-Objekt). Alles andere nimmt denselben Zweig wie heute ein falsy Wert. Danach ist der `undefined`-Zweig in `EventListener.apply()` tatsächlich unerreichbar; der Kommentar in `src/EventListener.ts:78-82`, der das heute schon behauptet, wird damit wahr — prüfen, ob er trotzdem umformuliert gehört. `skills/using-eventize/references/api-details.md:21` sagt bereits, `on()` ohne auflösbaren Listener werfe; nach dem Fix stimmt auch das. Achtung Coverage: wird ein Zweig echt unerreichbar, kann die `coverageThreshold` in `jest.config.ts` kippen — Schwellen **nicht** senken, sondern den toten Zweig entfernen oder die Zahlen anheben.

Zu BUG-006: Die Prüfung ist **NaN-spezifisch**, nicht `Number.isFinite` — `Priority.Max`/`Min` sind `±Infinity` und müssen weiter funktionieren (siehe »Entscheidungen«). Der Tupel-Zweig `on(ε, [['foo', NaN]], fn)` folgt derselben Regel; sein `??` in `src/subscribeTo.ts:104` hält heute nur `undefined` aus der Arithmetik, nicht NaN. Ein Spec, der `Priority.Max` und `Priority.Min` weiterhin als gültig festnagelt, gehört dazu.

**BUG-005 · medium · src/subscribeTo.ts:74-79, src/EventListener.ts:78-82** — on() akzeptiert jeden truthy Nicht-Listener und registriert eine tote Subscription

`_subscribeTo()` prüft nur `if (!listener)`. Ein truthy Wert, der kein Listener sein kann, kommt durch: `on(ε, 'foo', 5)` legt einen `EventListener` an, `getSubscriptionCount(ε)` meldet 1, und jedes `emit(ε, 'foo')` läuft still ins Leere — `detectListenerType()` liefert `undefined`, `apply()` fällt durch alle drei Zweige und kehrt zurück. Dieselbe Eingabe mit `0` statt `5` wirft dagegen ('subscribeTo() called with insufficient arguments'), weil `0` falsy ist: der realistische Weg hinein, ein durchgereichter numerischer Wert am Listener-Slot, verhält sich je nach Zahlenwert entgegengesetzt. Die tote Subscription lässt sich nur per `off()` wieder loswerden und verfälscht bis dahin jede Teardown-Assertion auf `getSubscriptionCount(ε) === 0` — genau die Prüfung, die `docs/lifecycle.md` empfiehlt. Zwei Stellen im Projekt behaupten das Gegenteil: `EventListener.ts:78-82` nennt den `undefined`-Zweig 'unreachable in practice, because _subscribeTo() rejects those before they reach here', und `skills/using-eventize/references/api-details.md:21` sagt, `on()` ohne auflösbaren Listener werfe.

Empfehlung: Die Prüfung von Truthiness auf Typ umstellen: durchlassen darf nur, was `detectListenerType()` einen Tag gibt — Funktion, String, Symbol oder Nicht-Null-Objekt. Alles andere nimmt denselben Zweig wie heute ein falsy Wert. Das macht den `undefined`-Zweig in `EventListener.apply()` tatsächlich unerreichbar, statt es nur zu behaupten, und bringt `api-details.md:21` in Deckung mit dem Code. Da die Änderung eine bisher stillschweigend akzeptierte Eingabe zurückweist, gehört sie in die CHANGELOG-Bruchliste — siehe Offene Fragen zur Alternative 'warnen statt werfen'. **→ Entschieden: werfen.**

**BUG-006 · low · src/EventStore.ts:12-43, src/subscribeTo.ts:51-57** — NaN als Priorität verschiebt den Listener still an eine willkürliche Stelle

`sortByPriorityAndId()` rechnet `b.priority - a.priority`; mit NaN ist jeder Vergleich false, wodurch `findInsertIndex()` die Binärsuche konsequent nach rechts laufen lässt und den Listener an einer Stelle einsetzt, die von der Bucket-Größe abhängt statt von der Priorität. Sonde: `on(ε,'foo',10,…)`, `on(ε,'foo',NaN,…)`, `on(ε,'foo',5,…)` dispatcht als ten, nan, five — der NaN-Listener landet zwischen zwei Prioritäten, zu denen er in keiner Ordnungsrelation steht. Kein Fehler, keine Warnung. Der Code kennt das Problem bereits: `subscribeTo.ts:96-104` begründet ausführlich, warum bei `[name, priority]`-Tupeln `??` statt `||` verwendet wird, nämlich um genau dieses NaN aus der Arithmetik herauszuhalten. Der direkte Weg — `on(ε, 'foo', Number(cfg.prio), fn)` mit unparsbarem `cfg.prio` — ist ungeschützt geblieben.

Empfehlung: In `_subscribeTo()` nach dem positionalen Dekodieren auf NaN prüfen und werfen — mit demselben Argument wie bei BUG-005 und im selben Durchgang. `Priority.Max` und `Priority.Min` bleiben unangetastet: `Infinity` ist ordnungsfähig, die Sonde bestätigt korrekte Sortierung und stabile id-Tiebreaks bei zwei Listenern auf `Priority.Max`. **→ Entschieden: werfen, Prüfung NaN-spezifisch statt `Number.isFinite`.**

---

### [x] 5. eventize() auf eingefrorenem Objekt meldet die Ursache

- Findings: BUG-007
- Ziel: Statt eines undurchsichtigen `TypeError` aus `Object.defineProperty` nennt der Fehler Grund und Ausweg.
- Dateien: `src/asEventized.ts`, die passende Spec-Datei, `docs/lifecycle.md`, `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npm test && npm run typecheck && npm run lint && npm run format:check`
- Commit: `fix(eventize): report why a non-extensible object cannot be eventized (BUG-007)`
- Hash: `78c8c10`

**Verlauf.** Eine Runde. Roter Lauf nachgewiesen und vom Reviewer selbst reproduziert: Datei auf den Vorstand zurückgesetzt, exakt 5 von 7 Fällen rot, dieselben zwei grün. Neue Spec-Datei `src/asEventized.spec.ts` mit 9 Fällen, Suite 668 → 677.

Die Prüfung sitzt **hinter** dem `isEventized()`-Guard, ein bereits eventisiertes und danach eingefrorenes Objekt läuft also nicht in den neuen Zweig — als Spec festgenagelt. `Object.isExtensible()` deckt alle drei Ursachen ab: `freeze()`, `preventExtensions()` und `seal()`; alle drei haben einen eigenen Fall.

**Ein Befund aus dem Review, der die Zusage rettete.** Der Fix warf zunächst `new Error(...)`, während die native Ursache ein `TypeError` war — damit wäre »kein Verhaltenswechsel, nur die Meldung« für Aufrufercode falsch gewesen, der per `instanceof TypeError` unterscheidet. Jetzt `new TypeError(...)`, mit eigenem Spec-Fall auf die Klasse. Die Zusage stimmt.

`class Eventize` erreicht den neuen Zweig praktisch nie: der Konstruktor besteht aus genau einer Anweisung, `eventize<TEvents>(this)`, und `this` ist vorher nicht greifbar. Per Code-Inspektion bestätigt, als Spec-Fall ehrlich so formuliert statt verschwiegen.

**Test zuerst**, rot gesehen. Reine Diagnosequalität, kein Verhaltenswechsel: der Aufruf schlägt vorher wie nachher fehl — der Spec prüft die Meldung, nicht das Ob. CHANGELOG-Eintrag als **Fix** unter `## Unreleased`; kein Bruch, weil der Aufruf nie funktioniert hat.

`Object.isExtensible()` deckt beide Fälle ab — `Object.freeze()` und `Object.preventExtensions()`. Ein bereits eventisiertes Objekt, das danach eingefroren wurde, darf nicht fälschlich in den neuen Zweig laufen; prüfen, ob `asEventized()` an dieser Stelle einen bestehenden Marker vorher erkennt, und den Fall als Spec festnageln.

**BUG-007 · low · src/asEventized.ts:14-19, src/utils.ts:71-81** — eventize() auf einem eingefrorenen Objekt wirft einen undurchsichtigen TypeError

`defineHiddenPropertyRO()` ruft `Object.defineProperty()` ohne Vorprüfung. Auf einem eingefrorenen oder mit `preventExtensions()` versiegelten Objekt wirft das: 'TypeError: Cannot define property Symbol(eventize), object is not extensible'. Die Meldung nennt weder eventize noch den eigentlichen Grund — dass ein Emitter ein Slot braucht und ein eingefrorenes Objekt keines aufnehmen kann. Weder README noch `docs/lifecycle.md` erwähnen die Einschränkung, kein Spec nagelt sie fest. Getroffen wird, wer `Object.freeze()` defensiv auf Konfigurations- oder Store-Objekte anwendet und diese anschließend eventisieren will — und die Bibliothek wirbt ausdrücklich damit, auf beliebigen bestehenden Objekten zu funktionieren.

Empfehlung: In `asEventized()` vor dem `defineProperty` `Object.isExtensible(obj)` prüfen und andernfalls mit einer eigenen Meldung werfen, die Ursache und Ausweg nennt, etwa 'eventize() cannot attach to a non-extensible object — eventize before freezing, or eventize a wrapper'. Dazu ein Spec-Fall und eine Zeile in `docs/lifecycle.md` unter 'What an emitter holds'. Reine Diagnosequalität, kein Verhaltenswechsel: der Aufruf schlägt vorher wie nachher fehl.
