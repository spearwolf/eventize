# Remediation-Plan — @spearwolf/eventize

Quelle: ./audit.html vom 29.07.2026 · Branch: `main` · erstellt: 01.08.2026
Baseline: clean ✓ · build ✓ · typecheck ✓ · attw --pack ✓ · test 754/754 in 30 Suites ✓ (Coverage 100 / 98.89 / 99.28 / 100) · lint ✓ · format:check ✓ — `npm run cbt` vollständig grün
Scope: 7 von 30 Befunden (1 high, 2 medium, 3 low, 1 info) plus 2 Punkte aus »Optimierungspotenzial«, dazu die Bereinigung von `docs/backlog.md`. Ausdrückliche Auswahl des Nutzers, keine Severity-Regel.

## Ausgenommen

Nicht Teil dieses Laufs, bewusst und auf Ansage: COR-001, SEC-001 bis SEC-007, DX-001, DX-002, TEST-001 bis TEST-003, TS-001, TS-002, COR-003, COR-004, API-002, BUILD-002, BUILD-003, BUILD-005, DEP-002, PERF-001, CLEAN-001. Ebenso die sechs Punkte im Audit-Anhang (»akzeptiert / zurückgestellt«) — sie ruhen auf Entscheidung des Projekts. Diese Punkte verschwinden zwar aus `docs/backlog.md` (Paket 7), aber nur, weil `audit.html` sie ab jetzt führt; behoben wird keiner von ihnen.

## Vorbestehende Fehler

Keine. Die Baseline ist auf allen sechs Stufen grün.

## Entscheidungen

- **CONS-001** — Ursache über `new Error(msg, {cause})` transportieren, Wortlaut der Meldung unverändert. Keine eigene Fehlerklasse: die würde einen zweiten `declare class` in `lib/index.d.ts` einziehen, und AGENTS.md hält den Zähler dort bei 1. (01.08.2026)
- **BUILD-004** — Backlog per Negativmuster `"!docs/backlog.md"` aus `files` nehmen. Die Datei bleibt liegen, README-Link und alle Verweise bleiben gültig. (01.08.2026)
- **docs/backlog.md** — die Abschnitte »Open« und »Deferred to the next major« werden vollständig gestrichen; alle 14 Einträge stehen ab jetzt in `audit.html` (als Befund oder im Anhang). (01.08.2026)
- **»Accepted, not scheduled«** — pro Eintrag entschieden, Details in Paket 7: Integrationsharness → `integration/README.md`; TypeScript-Blockade → AGENTS.md führt sie bereits im Volltext, nur der Rückverweis wird korrigiert; `_subscribeTo`-Heuristik → Kommentar in `src/subscribeTo.ts`; Dev-Advisories → bleiben in `docs/backlog.md`, für sie gibt es keine Stelle im Code. (01.08.2026)
- **getEventizeProtocol** — wird öffentlich aus `src/index.ts` exportiert. Der Punkt aus »Optimierungspotenzial« beschreibt genau eine Diagnose-Oberfläche für Konsumenten; intern wäre sie wertlos. (01.08.2026)

## Pakete

### [x] 1. Marker-Integrität: Protokollversion, unlöschbarer Slot, Diagnose-Oberfläche

- Findings: COR-002, COR-005, Optimierungspotenzial »getEventizeProtocol«
- Ziel: Zwei inkompatible eventize-Kopien auf einem Objekt scheitern mit einer benannten Diagnose an der Grenze statt mit einem `TypeError` aus dem Innersten des Dispatch — und der Marker lässt sich nicht mehr wegdeletieren.
- Dateien: `src/constants.ts`, `src/asEventized.ts`, `src/internals.ts`, `src/utils.ts`, `src/getEventizeProtocol.ts` (neu), `src/index.ts`, zugehörige Specs, `CHANGELOG.md`, `docs/migration.md`, `README.md`, `AGENTS.md`, `skills/using-eventize/`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `feat(core): version the eventize marker and seal its slot (COR-002, COR-005)`
- Hash: `693af1f`

**Erledigt am 01.08.2026.** Verify durch den Orchestrator selbst gelaufen: `npm run cbt` grün, 778 Tests / 32 Suites (vorher 754 / 30), Coverage 100 / 98.91 / 99.29 / 100. Reviewer-Urteil: alle drei Findings erfüllt, nichts Kritisches, nichts Wichtiges. Zusätzlich eine Mutationsprobe des Reviewers: Prüfung zurückgedreht und `configurable: true` wiederhergestellt → 12 von 15 Fällen in `marker-integrity.spec.ts` fallen.

Abweichungen von der Vorgabe, alle vom Reviewer als tragfähig bestätigt:

1. Kein `[eventize]`-Präfix im Fehlertext — `LOG_NAMESPACE` ist ausschließlich an `warn()` gebunden, keine der acht `throw`-Stellen in `src/` präfixt.
2. `defineHiddenPropertyRO` heißt jetzt `defineSealedHiddenProperty`. »RO« beschrieb den Wert, nicht die Existenz — genau die Verwechslung, aus der COR-005 entstand.
3. `getEventizeProtocol()` liefert `undefined` auch für einen Marker mit nicht-numerischem `protocol`, damit die Signatur `number | undefined` hält.

Kleine Befunde des Reviewers, notiert statt behoben (lösen laut Fehlerkette keine Runde aus):

- `AGENTS.md:25` und `src/internals.ts:8` sprechen weiter von »the two collaborators« / »the pair«, obwohl die Nutzlast jetzt drei Felder hat.
- Der Satz »one property load and one compare« beschreibt das Delta, nicht den Pfad: es sind zwei Ladevorgänge, Slot und `protocol`.
- README und `skills/using-eventize/references/api-details.md` behaupten, auch `getRetainedCount()` und `getRetainedEventNames()` werfen bei fremdem Marker. Zutreffend, aber nur `getSubscriptionCount()` ist verspect. **Das ist die Sorte »documented but untested«, die AGENTS.md ausdrücklich ausschließt** — zwei Zeilen Spec schließen es, gehört ins nächste Audit.
- `markAsForeign` und die beiden Payload-Fabriken stehen wortgleich in zwei Spec-Dateien; `src/__test-utils__/` existiert für genau das.
- `PROTOCOL_VERSION` bleibt intern, wer die Diagnose nutzt schreibt `=== 6` hartkodiert.
- Anmerkung, kein Befund: versiegelt ist die Property, nicht die Nutzlast. `ε[Symbol.for('eventize')].protocol = 5` bleibt erlaubt — der Befund zielte auf `delete`, insofern vollständig umgesetzt.

Nebenbefund des Implementierers: `getSubscriptionCount()`, `getRetainedCount()` und `getRetainedEventNames()` werfen jetzt bei fremdem Marker, weil alle drei über `internalsOf()` lesen. Bewusst so gelassen und dokumentiert — eine plausible `0` aus einem unerreichbaren Store ist schlimmer als die Diagnose.

**COR-002 · high · src/asEventized.ts:31, src/constants.ts:7, src/internals.ts:37-39, src/isEventized.ts:4-7** — Zwei eventize-Majors im selben Baum teilen sich den Marker und zerbrechen im Dispatch

Der Marker ist `Symbol.for('eventize')` — realm-weit registriert, also über Paketgrenzen hinweg identisch. `isEventized()` prüft allein, ob dieser Slot belegt ist, `internalsOf()` liest ihn strukturell aus. npm löst `@spearwolf/eventize@^5` und `@^6` problemlos nebeneinander auf, sobald v6 veröffentlicht ist. Verifiziert mit real installiertem v5.1.0 neben dem lokalen v6-Build in einem Prozess: v6 hält einen v5-Emitter für eventisiert und umgekehrt; `v6.on()` und `v6.emit()` auf einem v5-Emitter funktionieren still und leise, `emit()` stellt an die Listener beider Kopien zu. Erst dann bricht es: `v6.once()` gefolgt von `emit` wirft `TypeError: store.settleOneShots is not a function`, `v5.off()` auf einem v6-Emitter wirft `TypeError: listener.detach is not a function`. Der Fehler nennt weder eventize noch die Ursache, und er entsteht Aufrufe später als die Vermischung. AGENTS.md dokumentiert die ESM/CJS-Variante derselben Gefahr — die Versions-Variante ist wahrscheinlicher, weil sie kein Zutun des Nutzers braucht, nur einen transitiven Dependent. Das Zeitfenster für eine billige Lösung schließt sich mit der Veröffentlichung von 6.0.0: danach ist der Marker-Vertrag festgeschrieben.

Empfehlung: Eine Protokollversion in die Marker-Nutzlast schreiben (`{protocol: 6, keeper, store}`) und in `internalsOf()` prüfen — dem einen Chokepoint, den AGENTS.md ohnehin als solchen führt. Bei Abweichung mit einem benannten Fehler abbrechen, der Ursache und Abhilfe nennt ("zwei inkompatible Kopien von @spearwolf/eventize sind auf diesem Objekt aktiv — dedupe die Abhängigkeit"). Das verwandelt einen `TypeError` aus dem Innersten des Dispatch in eine Diagnose an der Grenze. Ein `peerDependencies`-Eintrag hilft hier nicht: das Problem ist die legitime parallele Auflösung, nicht eine falsche. Zusätzlich in `docs/migration.md` aufnehmen — für Konsumenten ist der Hinweis, ihren Baum vor dem Upgrade zu deduplizieren, die eigentliche Migrationsanweisung.

**COR-005 · low · src/utils.ts:73-83 (defineHiddenPropertyRO), src/asEventized.ts:31** — Der Marker-Slot ist `configurable` und damit löschbar

`defineHiddenPropertyRO()` legt die `Symbol.for('eventize')`-Property mit `configurable: true` an — verifiziert per Deskriptor: `{configurable: true, writable: false, enumerable: false}`. Ein `delete ε[Symbol.for('eventize')]` ist damit erlaubt, und die Folgen sind vollständig still: das Objekt liest sich danach als nicht eventisiert, `getSubscriptionCount()` fällt von 1 auf 0, während Listener und zurückgehaltene Werte in Kollaboratoren sitzen, die niemand mehr erreicht. Ein anschließendes `on()` baut wortlos einen zweiten, leeren Satz auf. Kein Sicherheitsproblem — das Symbol ist über `Symbol.for()` ohnehin erreichbar —, aber der Funktionsname verspricht read-only, und das gilt für den Wert und nicht für die Existenz der Property.

Empfehlung: `configurable: false`, sofern nichts den Slot entfernen muss; `asEventized()` als einziger Aufrufer tut das nicht. Sinnvollerweise zusammen mit COR-002 anfassen — beide Änderungen betreffen dieselbe Zeile und dieselbe Frage nach der Integrität des Markers.

**Optimierungspotenzial · getEventizeProtocol**

Das Protokollfeld aus COR-002 als Diagnose-Oberfläche mitnehmen. Wer den Marker ohnehin um eine Protokollversion erweitert, bekommt `getEventizeProtocol(obj)` praktisch geschenkt — und damit eine Antwort auf »welche Kopie hat dieses Objekt eventisiert?«, die heute nur über `ε[Symbol.for('eventize')]` zu haben ist.

Umsetzungsvorgaben für dieses Paket:

- Die Protokollkonstante gehört nach `src/constants.ts`, Wert `6`, und wird von `asEventized()` in die Nutzlast geschrieben.
- Die Prüfung sitzt in `internalsOf()` — dem Chokepoint, den AGENTS.md ohnehin als solchen führt. Sie muss ein reiner Feldzugriff plus Vergleich bleiben, kein Funktionsaufruf im Erfolgsfall: `internalsOf()` liegt auf jedem `on`/`emit`/`off`-Pfad. Der Wurfzweig darf ausgelagert sein.
- `asEventized()` gibt bei seinem `isEventized()`-Frühausstieg kein fremdes Emitter-Objekt mehr wortlos zurück, sondern lässt dieselbe benannte Diagnose fallen. Sonst bekommt der Aufrufer ein Objekt in die Hand, das erst beim ersten Zugriff bricht.
- `isEventized()` bleibt unverändert eine reine Slot-Sonde. Es ist ein Type Guard und darf nicht werfen; die Unterscheidung »eventisiert« von »von *dieser* Kopie eventisiert« ist genau das, was `getEventizeProtocol()` beantwortet.
- `getEventizeProtocol(obj)` liefert die Protokollnummer oder `undefined` für alles, was den Slot nicht trägt — es wirft nie, denn es ist das Werkzeug, mit dem man die Lage *vor* dem Knall diagnostiziert.
- `defineHiddenPropertyRO()` bekommt `configurable: false`. Prüfen, ob der Name danach noch stimmt, und ob irgendein Spec den Slot löscht.
- Der Fehler bleibt ein `TypeError` und nennt Ursache **und** Abhilfe, in der Wortwahl der übrigen Meldungen des Pakets (`LOG_NAMESPACE`-Stil, siehe die `TypeError`-Meldung in `asEventized()`).
- Specs: mindestens ein Fall pro Zweig — fremdes Protokoll auf `on`/`emit`/`off`, `asEventized()` auf einem fremden Marker, `getEventizeProtocol()` für eventisiert / nicht eventisiert / fremd, sowie der jetzt fehlschlagende `delete` des Slots.
- Doku: `CHANGELOG.md` unter `## \`v6.0.0\` (unreleased)`, `docs/migration.md` mit der Dedupe-Anweisung für Konsumenten, `README.md` bei der Zustandsinspektion, dazu `AGENTS.md` (der Absatz über die realm-weite Marker-Identität und die Counter-Scoping-Warnung stimmt danach nicht mehr in jedem Detail) und `skills/using-eventize/`.

### [x] 2. `peekListeners()` — Lesen ohne Anlege-Nebenwirkung

- Findings: Optimierungspotenzial »peekListeners«
- Ziel: Wer die Listener eines Event-Namens nur lesen will, bekommt eine Signatur, die weder einen Bucket anlegt noch eine Live-Referenz aushändigt.
- Dateien: `src/EventStore.ts`, `src/__test-utils__/listeners.ts`, `src/EventStore.spec.ts`, `AGENTS.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `refactor(store): add a side-effect-free peekListeners() for read-only access`
- Hash: `f9997bd`

**Erledigt am 01.08.2026, nach zwei Runden der Fehlerkette.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 785 Tests / 32 Suites, Coverage 100 / 98.92 / 99.3 / 100.

Umsetzung: `peekListeners(eventName): ReadonlyArray<EventListener>` liest `catchEmAllBucket` für `'*'` und sonst `namedListeners.get()`, mit einem modullokalen `Object.freeze([])` als geteilter Antwort für unbekannte Namen. Kein `set`, kein `createBucket()`, kein Weg für das eingefrorene Array in einen Bucket-Slot — das garantiert der Typ, nicht die Disziplin. `listenersOf()` in `src/__test-utils__/listeners.ts` läuft darüber und kopiert nicht mehr. `forEach()`, `bucketForMutation()` und `getListenersForEventName()` unverändert.

Fehlerkette:

- **Runde 1** (zwei `wichtig`): Der neue AGENTS.md-Satz behauptete, `peekListeners()` gebe »instead of the live, mutable one« zurück — es ist dieselbe lebende Referenz, nur `ReadonlyArray`-typisiert, und die Pre-Clone-Falle gilt unverändert. Zweitens benannte kein JSDoc, dass `peekListeners('*')` und `getListenersForEventName('*')` für denselben Namen verschiedene Arrays liefern; dazu fehlte der Spec, der die »kein Map-Eintrag«-Zusage für den Wildcard-Pfad festnagelt. Beides behoben, plus drei kleine.
- **Runde 2** (frischer Implementierer, stärkste Stufe): Die Reparatur des Bullets hatte eine neue Falschaussage eingezogen — »`add()` is its only caller since v6.0.0«, während sechs Spec-Stellen die Methode weiterhin direkt aufrufen, und zwar gewollt (Bucket-Identität, Klon-Zählung, Impostor-Bucket). Der Bullet wurde als Ganzes neu geschrieben, jede Aussage darin am Code belegt. Im selben Zug ein Rest deutscher Auftragssprache (»sofort verwenden«) aus dem englischen Doc-Kommentar in `src/EventStore.ts` entfernt.

Bemerkenswert an diesem Paket: der Code war nach dem ersten Anlauf richtig, die Prosa darüber dreimal nicht. Beide Reviews haben mit Mutationsproben gearbeitet — Prüfung zurückgedreht, Zweig entfernt — statt den Specs zu glauben.

Kleiner Befund, notiert statt behoben: `EventStore.spec.ts` pinnt mit `expect(a).toBe(b)` die im Plan ausdrücklich offengelassene Wahl »geteilte Konstante statt frisches Array« als Vertrag fest. Bewusst so gelassen — die Laufzeitzusage für den geteilten Leerfall ist mehr wert als die Freiheit, es später anders zu machen.

**Optimierungspotenzial · peekListeners**

`EventStore.getListenersForEventName()` legt Buckets bei jeder Abfrage lazy an und gibt Live-Referenzen heraus. Für den internen Aufrufer ist beides richtig; die Spec-Helfer in `src/__test-utils__/listeners.ts` müssen deshalb sofort kopieren. Eine lesende Variante würde die Regel »sofort verwenden« von der Disziplin auf den Typ verlagern.

Umsetzungsvorgaben für dieses Paket:

- `peekListeners(eventName)` liefert `ReadonlyArray<EventListener>` und legt nichts an: kein Bucket, kein Map-Eintrag. Für einen unbekannten Namen ein leeres Ergebnis — ob geteilte Konstante oder frisches Array, entscheidet der Umsetzende; ein geteiltes leeres Array darf dann aber unter keinen Umständen nach außen mutierbar sein.
- Der Rückgabetyp ist das eigentliche Produkt dieses Pakets. `ReadonlyArray` verlagert genau die Regel, um die es geht, vom Kommentar in den Compiler.
- `getListenersForEventName()` bleibt unverändert und bleibt öffentlich: `EventStore.add()` braucht das Anlegen, und mehrere Specs prüfen ausdrücklich die Lazy-Erzeugung und die `'*'`-als-Schlüssel-Kante.
- `listenersOf()` in `src/__test-utils__/listeners.ts` stellt auf `peekListeners()` um. Dabei prüfen, ob der Spread dort noch nötig ist — `ReadonlyArray` löst genau das Problem, das die Kopie bisher gelöst hat, aber ein Spec, der das Ergebnis sortiert, braucht sie weiterhin.
- Nur die Aufrufer umstellen, die lesen. Die Specs in `EventStore.spec.ts` und `once_on_aggregation.spec.ts`, die Bucket-Identität oder Klon-Zählung messen, bleiben auf `getListenersForEventName()` — sie messen genau das, was `peekListeners()` nicht mehr tut.
- **Keine Änderung an `forEach()`.** Der Absatz in AGENTS.md über die Inlining-Budget-Grenze gilt unverändert.
- `AGENTS.md`: der Punkt »`getListenersForEventName()` creates buckets lazily and hands out live references« bekommt den Zusatz, dass es für Leser jetzt eine zweite Tür gibt.
- Kein CHANGELOG-Eintrag: `EventStore` ist seit v6.0.0 in den veröffentlichten Typen opak, kein Konsument sieht die Klasse. Rein interner Refactor.

### [x] 3. `EventKeeper.isKnown()` streichen

- Findings: IMPL-001
- Ziel: Die einzige Methode im Repository ohne Produktionsaufrufer verschwindet, die Specs lesen `keeper.eventNames.has(name)` direkt.
- Dateien: `src/EventKeeper.ts`, `src/EventKeeper.spec.ts`
- Modell: günstigste Stufe
- Verify: `npm run cbt`
- Commit: `refactor(keeper): drop isKnown(), let the specs read eventNames directly`
- Hash: `843647e`

**Erledigt am 01.08.2026, ohne Runde.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 785 Tests / 32 Suites — unverändert, kein Testfall verloren.

**Korrektur am Audit-Text: es waren 27 Vorkommen, nicht 24.** Der Befund IMPL-001 nennt 24; `grep -c 'isKnown('` gegen den Stand vor der Änderung liefert 27. Alle 27 umgeschrieben, keins übersehen, keins doppelt. Der Reviewer hat das als `wichtig` eingestuft, weil die Zahl im Befund steht — die Umsetzung ist davon nicht betroffen.

Zusätzliche Gegenprobe durch den Orchestrator: normalisiert man `isKnown(` und `eventNames.has(` auf denselben Platzhalter, sind entfernte und hinzugefügte Zeilen des Diffs zeichengleich. Damit ist bewiesen, was `cbt` hier nicht bemerken könnte — keine Assertion wurde still gedreht, kein Event-Name und kein erwarteter Wahrheitswert verändert.

**IMPL-001 · info · src/EventKeeper.ts:66-68** — `EventKeeper.isKnown()` hat keinen Produktionsaufrufer

Die Methode wird ausschließlich aus `EventKeeper.spec.ts` heraus verwendet — 24 Vorkommen, allesamt Assertions. Kein Produktionscode fragt sie ab; der Keeper selbst liest `this.eventNames.has()` direkt. Sie ist damit eine reine Spec-Oberfläche, was legitim ist, aber unmarkiert bleibt: der nächste Bearbeiter kann nicht sehen, dass ein Umbau der Methode nur Tests berührt. Der einzige Befund dieser Art im Repository — es gibt sonst keine ungenutzten Exporte, keinen auskommentierten Code und kein einziges `TODO`, `FIXME` oder `HACK` in `src/`, `scripts/`, `integration/` oder `docs/`.

Empfehlung (Variante des Nutzers): streichen und die Specs `keeper.eventNames.has(name)` schreiben lassen.

Umsetzungsvorgaben für dieses Paket:

- Rein mechanisch. Methode löschen, alle 24 Vorkommen in `src/EventKeeper.spec.ts` auf `keeper.eventNames.has(…)` umschreiben. Keine Assertion inhaltlich ändern, keine umformulieren, keine zusammenfassen.
- Restliche Vorkommen im Repository prüfen, bevor gelöscht wird — die Suche muss über `src/` hinaus auch `integration/`, `docs/`, `skills/` und `README.md` abdecken.
- Kein CHANGELOG-Eintrag: `EventKeeper` ist nicht Teil der öffentlichen Oberfläche.

### [x] 4. Ein Fehlertext, drei unterscheidbare Ursachen

- Findings: CONS-001
- Ziel: Die Ursache eines fehlgeschlagenen `subscribeTo()` steht im `Error`, nicht nur auf der Konsole — bei unverändertem Wortlaut.
- Dateien: `src/subscribeTo.ts`, `src/subscribeTo.spec.ts` (oder der bestehende Spec zu dieser Fehlerstelle), `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `fix(subscribe): carry the failure reason on Error.cause (CONS-001)`
- Hash: `9dacbb0`

**Erledigt am 01.08.2026, ohne Runde, ohne Befund.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 788 Tests / 32 Suites (vorher 785), Coverage 100 / 98.93 / 99.29 / 100.

Roter Lauf belegt: alle drei neuen Fälle scheiterten vor dem Fix mit `Received: undefined` auf `Error.cause`. Die Ursache wird einmal bestimmt, `warn()`-Meldung und `cause` speisen sich daraus — die Ternärkette läuft nicht zweimal. Wortlaut der geworfenen Meldung zeichengleich, die bestehenden Pinning-Specs (`/insufficient arguments/`) bleiben grün.

Die heikle Stelle, vom Reviewer eigens nachgerechnet: `''` ist falsy, trifft aber `listener == null` nicht, und `detectListenerType('')` liefert `LISTENER_IS_NAMED_FUNC` statt `undefined` — der leere Methodenname landet also korrekt bei `empty-method-name` und nicht bei `missing-listener`. Der zugehörige Spec exerziert das mit einem echten Vier-Parameter-Aufruf, statt es zu behaupten.

`assertPriorityIsUsable()` bleibt unverändert: sie wirft für genau eine Ursache einen einzigen Text, es gibt nichts zu unterscheiden. Vom Reviewer als tragfähig bestätigt.

Vorbestehende Altlast, ausdrücklich keine Regression: `detectListenerType(listener)` wird weiterhin bis zu zweimal aufgerufen, einmal im Guard und einmal in der Ursachenbestimmung. Exakt derselbe Aufrufcount wie vor der Änderung.

**CONS-001 · low · src/subscribeTo.ts:140-154** — Ein Fehlertext für drei verschiedene Ursachen

Fehlender Listener, nicht dispatchbarer Listener und leerer Methodenname werfen alle `subscribeTo() called with insufficient arguments`. Die Unterscheidung existiert — sie steht in der `warn()`-Zeile direkt darüber und ist dort sorgfältig ausformuliert —, landet aber nur auf der Konsole. Was im Bug-Report, im Error-Tracker oder im CI-Log auftaucht, ist der Wortlaut des `Error`, und der sagt bei zwei der drei Ursachen etwas Falsches: bei `on(ε, 'foo', 5)` fehlt kein Argument. Der Kommentar hält fest, dass die Meldung seit v4 unverändert und dokumentiert ist — der Wortlaut ist also bewusst eingefroren, die fehlende Unterscheidbarkeit aber nicht deshalb weniger unpraktisch.

Empfehlung: Den Wortlaut lassen und die Ursache daneben transportieren: `new Error(msg, {cause: 'not-dispatchable'})` oder eine eigene Fehlerklasse mit einem `reason`-Feld. Beides ist rückwärtskompatibel — wer auf die Zeichenkette prüft, merkt nichts —, und ab da steht die Ursache dort, wo sie gelesen wird.

Umsetzungsvorgaben für dieses Paket:

- Entschieden ist die `cause`-Variante. Keine neue Fehlerklasse, kein neuer Export.
- Die drei Werte sind Zeichenketten und decken sich mit der Dreiteilung der `warn()`-Zeile darüber: fehlender Listener, nicht dispatchbar, leerer Methodenname. Die Zuordnung darf nicht doppelt berechnet werden — die Ternärkette existiert bereits, sie wird einmal ausgewertet und für Meldung und `cause` genutzt.
- Wortlaut der `Error`-Meldung bleibt buchstäblich unverändert; der Kommentar darüber wird nachgezogen, weil »One thrown message for all three« danach nur noch die halbe Wahrheit ist.
- `assertPriorityIsUsable()` im selben Modul wirft ebenfalls — prüfen, ob es dieselbe Behandlung verdient. Falls ja, im selben Paket erledigen; falls es aus gutem Grund anders liegt, im Report begründen.
- Spec: je ein Fall pro `cause`-Wert. `ES2022` ist Target und `lib`, `Error.cause` steht damit ohne weiteres zur Verfügung.
- `CHANGELOG.md` unter `## \`v6.0.0\` (unreleased)`, eine Zeile.

### [x] 5. package.json: vollständige exports-Map, Backlog aus dem Tarball

- Findings: BUILD-001, BUILD-004
- Ziel: Jeder Resolver findet einen Einstiegspunkt und die deklarierten Typen, `require('@spearwolf/eventize/package.json')` funktioniert — und interne Planungsnotizen verlassen das Repository nicht mehr.
- Dateien: `package.json`
- Modell: mittlere Stufe
- Verify: `npm run cbt` und `npm pack --dry-run` (die Ausgabe muss `docs/backlog.md` nicht mehr nennen)
- Commit: `build: complete the exports map and keep the backlog out of the tarball (BUILD-001, BUILD-004)`
- Hash: `e055fa8`

**Erledigt am 01.08.2026, ohne Runde, ohne Befund.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 788 Tests / 32 Suites, Version unverändert `6.0.0-dev`.

Belege, jeweils selbst nachgefahren:

- `lib/index.d.mts` und `lib/index.d.ts` existieren beide (je 23.084 B), jeder Pfad der Map zeigt auf eine Datei, die es gibt.
- Condition-Reihenfolge `types` → `import` → `require` → `default`, wie vorgegeben.
- `npm pack --dry-run`: 20 Dateien statt 21, 171,6 kB statt 175,8 kB. `docs/backlog.md` ist raus, die übrigen fünf `docs/*.md` sind drin.
- `attw --pack` grün in allen vier Modi, den neuen `package.json`-Subpath eingeschlossen; `require.resolve('@spearwolf/eventize/package.json')` löst auf, statt `ERR_PACKAGE_PATH_NOT_EXPORTED` zu werfen.
- `default` zeigt auf die ESM-Datei und ist keine Falle: Node setzt bei `require()` immer die Condition `require`, die vorher matcht. `default` erreicht nur, wer weder `import` noch `require` aktiv setzt.

**Nebenbefund für Paket 7:** drei weitere relative Links auf `docs/backlog.md` zeigen für einen npm-Konsumenten künftig ins Leere — `CHANGELOG.md:68`, `CHANGELOG.md:76` und `docs/lifecycle.md:99`. `README.md:70` bleibt auf Ansage unverändert. Die drei gehören in Paket 7 mitgeprüft.

**BUILD-001 · medium · package.json:12-15** — exports-Map ohne `types`, ohne `default` und ohne `./package.json`

Die Map lautet `{"import": "./lib/index.mjs", "require": "./lib/index.js"}` — mehr nicht. Drei Folgen. Erstens: Typen werden nirgends deklariert, sondern nur über die Dateinamens-Inferenz gefunden (`index.d.mts` neben `index.mjs`). `attw --pack` ist heute grün in allen vier Modi, die Garantie ruht damit aber auf einer Konvention von tsup statt auf einer Aussage im Manifest. Zweitens: ohne `default`-Zweig erhält jeder Resolver, der weder unter `import` noch unter `require` auflöst — eigene Condition-Sets, manche Bundler-Konfigurationen, einige Test-Runner — überhaupt keinen Einstiegspunkt. Drittens: `./package.json` ist nicht exportiert, was beim Sondieren dieses Audits real zuschlug — `require('@spearwolf/eventize/package.json')` scheitert mit `ERR_PACKAGE_PATH_NOT_EXPORTED`. Werkzeuge, die die Manifestdaten eines Pakets lesen (Bundler-Plugins, Versionssonden, Lizenz-Scanner), laufen dagegen.

Empfehlung: Auf die vollständige Form gehen: `".": {"types": {"import": "./lib/index.d.mts", "require": "./lib/index.d.ts"}, "import": "./lib/index.mjs", "require": "./lib/index.js", "default": "./lib/index.mjs"}` plus `"./package.json": "./package.json"`. `attw --pack` läuft bereits im `cbt`-Gate und verifiziert die Änderung sofort.

**BUILD-004 · low · package.json:17-24 (files), README.md:70** — `docs/backlog.md` geht mit ins npm-Paket

`files` nennt `docs`, und `npm pack --dry-run` bestätigt: `docs/backlog.md` liegt mit 10.852 Bytes im Tarball, den jeder Konsument installiert. Interne Planungsnotizen — verschobene Entscheidungen, akzeptierte Defekte, Vorhaben — landen damit bei jedem Nutzer, und README-Zeile 70 verlinkt die Datei zusätzlich öffentlich.

Entschieden: unbeabsichtigt. `"!docs/backlog.md"` in `files`, die Datei bleibt an ihrem Platz.

Umsetzungsvorgaben für dieses Paket:

- Die exports-Map wörtlich in der empfohlenen Form. Die Reihenfolge der Conditions ist bedeutungstragend: `types` zuerst, `default` zuletzt.
- Vorher gegen die tatsächlichen Build-Artefakte prüfen: `npm run build` und dann nachsehen, ob `lib/index.d.mts` und `lib/index.d.ts` beide existieren. Weicht tsup davon ab, gilt der Dateiname auf der Platte, nicht der im Report.
- `main`, `module` und `types` auf oberster Ebene bleiben stehen — sie bedienen Resolver ohne exports-Unterstützung.
- `"!docs/backlog.md"` steht **nach** `"docs"` im Array; npm wertet die Muster in Reihenfolge aus.
- Verifiziert wird mit `npm pack --dry-run`, und die Ausgabe wird gelesen: `docs/backlog.md` weg, alles andere unter `docs/` noch da. `README.md:70` bleibt unverändert, der Link zeigt auf GitHub.
- `CHANGELOG.md` unter `## \`v6.0.0\` (unreleased)`: die exports-Map ist für Konsumenten sichtbar.

### [x] 6. Duck-Typing: der Event-Name `emit` trifft die erste Stufe

- Findings: API-001
- Ziel: Die eine Kollision im zweistufigen Duck-Typing-Protokoll steht dort, wo das Protokoll beschrieben ist — statt sich erst im Debugger zu zeigen.
- Dateien: `README.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/api-details.md`, ggf. `docs/typed-events.md`
- Modell: günstigste Stufe
- Verify: `npm run cbt`
- Commit: `docs: note that the event name 'emit' hits the first duck-typing stage (API-001)`
- Hash: `9b83694`

**Erledigt am 01.08.2026, nach zwei Runden.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 788 Tests / 32 Suites. Kein Byte unter `src/` verändert — genau wie das Audit es verlangt.

Fehlerkette, beide Runden dieselbe Fehlerklasse:

- **Runde 1**: Alle drei Textstellen behaupteten, `.emit` liege auf jedem Objekt (»exists on every object«, »always exists«, »every object carries«). Falsch: `'emit' in {}` ist `false`, `emit` steht nicht auf `Object.prototype`. Die Kollision trifft in Wahrheit genau die Ziele, die ein `.emit` haben — also ausgerechnet die Objektform, für die die Rückfallebene gebaut wurde. Ein Ziel ohne `.emit` verfehlt beide Stufen und ist ein stiller No-op.
- **Runde 2** (frischer Implementierer eine Stufe höher): Die Korrektur hatte den harten Fehler nur abgeschwächt — »a method most targets carry« ist eine unbelegte Häufigkeitsaussage und widerspricht dem README-Nachbarsatz, der Duck-Typing gerade mit »adapters, mocks, or plain method-bags« anpreist. Genau die tragen kein `.emit`. Der Satz formuliert jetzt die Bedingung statt der Verbreitung.

Geprüft und folgenlos: `dispatchableMember()` greift für diesen Namen nicht, weil `Object.prototype.emit` schlicht `undefined` ist. Beide Reviewer haben das gegen den gebauten ESM-Build laufen lassen, mit und ohne `.emit` am Ziel.

`docs/typed-events.md` bekam nichts: der dortige Abschnitt behandelt das Verhalten ohne Generics und verweist für das Protokoll auf die README. Vom Reviewer bestätigt.

Kleiner Rest, notiert statt korrigiert: »on a target with its own `.emit`« liest sich streng genommen wie »eigene Property«, während auch ein geerbtes `.emit` die Kollision auslöst. Idiomatisch trägt die Formulierung; drei Runden an einem Satz sind genug.

**API-001 · low · src/eventize-api.ts:178-192 (_duckEmitOne)** — `emit(obj, 'emit', …)` auf einem Duck-Target verliert den Event-Namen

Das Duck-Typing-Protokoll ist zweistufig: erst `obj[eventName](...args)`, dann als Rückfallebene `obj.emit(eventName, ...args)`. Für den Event-Namen `emit` kollidieren die Stufen — die erste greift, und das Ziel wird als `obj.emit(...args)` aufgerufen, ohne den Event-Namen. Verifiziert: `emit(obj, 'emit', 1, 2)` erreicht den Handler als `(1, 2)`, nicht als `('emit', 1, 2)`. Das ist die dokumentierte Regel, buchstäblich angewandt, für den einen Namen, den das Protokoll selbst reserviert. Kein Defekt im engeren Sinn, aber die Argumentform hängt bei genau diesem Namen davon ab, welche Stufe zuerst greift — und ein Event-Name aus externen Daten kann `emit` heißen.

Empfehlung: In der Duck-Typing-Sektion der README einen Satz dazu, dass `emit` als Event-Name die erste Stufe trifft und der Handler die Argumente ohne Namen sieht. **Eine Codeänderung ist nicht angeraten**: `eventName === 'emit'` direkt an die Rückfallebene zu leiten wäre eine stille Verhaltensänderung an einer Stelle, an der die aktuelle Regel wenigstens vorhersagbar ist.

Umsetzungsvorgaben für dieses Paket:

- **Kein Code wird angefasst.** `src/eventize-api.ts` bleibt Zeile für Zeile, wie es ist. Wer hier eine Sonderbehandlung einbaut, hat den Befund missverstanden.
- Der Satz gehört in die Duck-Typing-Sektion der README (um Zeile 254 herum, die das zweistufige Protokoll beschreibt) und in `skills/using-eventize/` — laut AGENTS.md eine Dispatch-Semantik, also SKILL.md für die Kurzfassung und `references/api-details.md` für das Detail.
- `skills/using-eventize/` bleibt selbsttragend: kein Verweis, der aus dem Ordner hinauszeigt.
- Kein CHANGELOG-Eintrag — beschrieben wird bestehendes Verhalten, geändert wird nichts.

### [x] 7. docs/backlog.md bereinigen

- Findings: — (Auftrag des Nutzers, im Anschluss an die Audit-Aufnahme)
- Ziel: Der Backlog führt nur noch, was nirgends sonst steht; alles andere lebt dort, wo es beim Arbeiten gelesen wird.
- Dateien: `docs/backlog.md`, `integration/README.md`, `src/subscribeTo.ts`, `AGENTS.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `docs: prune the backlog down to what audit.html does not carry`
- Hash: `222e9e5`

**Erledigt am 01.08.2026, eine Runde für vier kleine Befunde.** Verify durch den Orchestrator selbst: `npm run cbt` grün, 788 Tests / 32 Suites.

Der Reviewer hat alle 17 gestrichenen Einträge einzeln gegen die JSON-Insel von `audit.html` gehalten: jeder steht dort, als Befund oder im `acknowledged`-Anhang. Kein Informationsverlust. Die Audit-Texte sind durchweg ausführlicher als die Backlog-Fassungen waren.

Umgezogen:

- **`integration/README.md`** — neuer Abschnitt »Why this stays manual« vor »Patches«: Docker und Laufzeit als Grund gegen `cbt`, eigener Workflow vor dem Deploy-Job falls je automatisiert, dazu die CJS-Lücke (signalize konsumiert nur ESM, `attw --pack` prüft Typauflösung statt Verhalten).
- **`src/subscribeTo.ts`** — sechs Zeilen Kommentar vor der Verzweigungskette, mit Zeiger auf die AGENTS.md-Regel »`subscribeTo` and `types.ts` move in lockstep«. Reiner Kommentar, keine Issue-Kennung, kein Verhalten berührt.
- **TypeScript-Blockade** — ersatzlos gestrichen, AGENTS.md führt sie im Volltext. Der Rückverweis »Tracked in `docs/backlog.md`« ist dort und im CHANGELOG nachgezogen.
- **Dev-Advisories** — bleiben in `docs/backlog.md`, Wortlaut unverändert. Für sie gibt es keine Stelle im Code.

Verweise auf `docs/backlog.md`: `README.md:70` bleibt auf Ansage verlinkt, nur die Beschreibung passt sich der kürzeren Datei an. Drei Verweise in `CHANGELOG.md` und `docs/lifecycle.md` sind entfallen, weil die Zielabschnitte nicht mehr existieren — die Begründungen stehen an den betreffenden Stellen ohnehin vollständig.

**Zwei CHANGELOG-Zeilen korrigiert, kein neuer Eintrag.** Eine davon behauptete, `audit.html` und ein `remediation-plan.md` seien »gone« — eine Bestandsaussage, der seit dem committeten Audit ein `ls` widerspricht, mitsamt dem Nachsatz über temporäre Issue-Kennungen, die die Commits dieses Laufs sehr wohl tragen. Vom Reviewer geprüft und als richtig bestätigt.

Runde für vier kleine Befunde: eine hinzugedichtete Einschränkung im umgezogenen Integrationstext (»only relevant when eventize's public surface changes« — der Harness fängt auch Verhaltensänderungen hinter unveränderter Signatur), die Unterscheidung »stand schon dort« gegen »ist dorthin gezogen« im neuen Kopf, ein fehlender relativer Pfad auf `../audit.html` und der fehlende Zeiger auf die Lockstep-Regel.

Der Backlog hat drei Abschnitte, und für jeden gilt etwas anderes:

**»Open« — vollständig streichen.** Alle zwölf Einträge stehen als Befunde in `audit.html`: `Priority` als veränderbares Objekt (COR-003), `on(ε, [], fn)` (COR-004), `inject()`-Kollision (API-002), der löschbare Marker-Slot (COR-005, in Paket 1 behoben), unerreichbare Branches unter der Coverage-Schwelle (TEST-003), der Doppel-Release-Guard ohne Spec (TEST-002), fehlendes `noEmit` (BUILD-005), `format:check` nur über `src/**` (DX-001), typescript-eslint ohne Typinformationen (TS-002) sowie die vier Punkte aus »CI hardening« (SEC-001, SEC-003, SEC-006, SEC-007).

**»Deferred to the next major« — vollständig streichen.** Beide Einträge stehen im Anhang von `audit.html`, und beide haben zusätzlich ein Zuhause im Repository: `off(ε, eventName, listenerObject)` steht in AGENTS.md unter »Known asymmetries« und in `docs/lifecycle.md`; die Legacy-Aliase tragen `@deprecated` in `src/Priority.ts` und `src/types.ts`.

**»Accepted, not scheduled« — pro Eintrag entschieden:**

- *Der Integrationsharness bleibt manuell* → nach `integration/README.md`. Dort steht bereits, was der Harness tut; die Entscheidung, warum er in keiner Pipeline hängt und wohin er gehörte, wenn er je automatisiert wird, gehört daneben. Der Hinweis auf den fehlenden CJS-Smoke-Test wandert mit — er beschreibt die Lücke genau dieses Harnesses.
- *TypeScript bleibt auf 5.9* → aus dem Backlog entfernen. AGENTS.md führt die Blockade bereits im Volltext (»TypeScript is pinned below 7, on purpose«), inklusive beider Peer-Ranges und der Warnung vor `--force`. Der Satz »Tracked in `docs/backlog.md`« am Ende dieses Absatzes wird nachgezogen, sonst zeigt er auf einen Eintrag, den es nicht mehr gibt.
- *`_subscribeTo`'s argument heuristic is comment-structured* → als Kommentar an die Heuristik selbst, `src/subscribeTo.ts` bei der Ternärkette um Zeile 107-128. Der Befund handelt von genau diesen Zeilen, und der nächste Bearbeiter dieser Kette ist der einzige, für den er zählt. Kurz halten: dass die Zuordnung Zweig → Aufrufform nur im Kommentar lebt, dass `SubscribeArgs` in `types.ts` mitgeführt werden muss, und dass eine deklarative Formtabelle die bessere, aber große Lösung wäre.
- *Dev-dependency advisories and versions* → **bleibt in `docs/backlog.md`.** Der Punkt hängt an `package-lock.json` und an einem nicht terminierten Build-System-Umbau; es gibt keine Codestelle, an der er beim Arbeiten gelesen würde.

Umsetzungsvorgaben für dieses Paket:

- Der Kopf von `docs/backlog.md` (die Absätze über Zweck und Schließen von Einträgen) wird nachgezogen: die Datei ist danach eine kurze Restliste, kein Register. Der Verweis auf die verschwundenen `PERF-001`/`MEM-002`-Bezeichner kann bleiben oder fallen — was bleibt, muss stimmen.
- Der Kopf bekommt außerdem einen Satz, der `audit.html` als die Stelle benennt, an der die übrigen Punkte jetzt stehen. Ohne ihn liest der nächste Bearbeiter eine leere Datei als »nichts offen«.
- README-Zeile 70 verlinkt den Backlog weiterhin und bleibt gültig — die Datei existiert ja. Prüfen, ob die dortige Beschreibung (»known, accepted and deliberately deferred items«) nach der Kürzung noch trägt.
- Verschieben heißt verschieben: der Text wird an der neuen Stelle in der Sprache und im Ton der Zieldatei geschrieben, nicht als Zitatblock eingeklebt. Alle Zieldateien sind englisch.
- Keine Verhaltensänderung, kein CHANGELOG-Eintrag.

## Abschluss

**Voller Verify-Lauf auf dem übergebenen Baum (01.08.2026):** `npm run cbt` grün auf allen sechs Stufen — clean, build, `tsc --noEmit`, `attw --pack` in allen vier Modi, 788 Tests in 32 Suites, Coverage 100 / 98.93 / 99.29 / 100, Lint und Prettier ohne Ausgabe. Baseline waren 754 Tests in 30 Suites; nichts, was vorher grün war, ist rot geworden.

### Semver

**Keine Versionsanhebung, und das ist keine Auslassung.** `package.json` steht auf `6.0.0-dev`; AGENTS.md hält den `-dev`-Suffix ausdrücklich fest, weil `scripts/publishPackage.cjs` genau daran vor `npm publish` abbricht. Releasen ist eine menschliche Entscheidung.

Die Bewertung wäre andernfalls **major**, gemessen an der öffentlichen Oberfläche vor `e6ec81c` gegen `HEAD`:

- `getEventizeProtocol()` ist ein neuer Export — für sich genommen minor.
- `on`/`emit`/`off` werfen jetzt auf einem Objekt, das eine fremde eventize-Kopie markiert hat, wo sie vorher still liefen. »Wirft jetzt, wo vorher still zurückgegeben wurde« ist major.
- `delete ε[Symbol.for('eventize')]` wirft im Strict Mode, statt den Marker zu entfernen. Ebenfalls major.
- Die exports-Map wurde ausschließlich geweitet (`types`, `default`, `./package.json`); der Wechsel von der Kurzform auf den `"."`-Schlüssel ist äquivalent. Minor.
- `Error.cause`, `peekListeners()`, der gestrichene `EventKeeper.isKnown()` und der aus dem Tarball genommene Backlog berühren die öffentliche Oberfläche nicht.

Das läuft ins Leere, weil nie ein `6.x` veröffentlicht wurde: alles Unreleased liegt unter `## \`v6.0.0\` (unreleased)`, und nichts darin kann einen Konsumenten brechen, der nie ein `6.x` hatte. Genau die Regel, die AGENTS.md unter »Versioning right now« aufstellt.

### CHANGELOG

Kein zusammenfassender Lauf-Eintrag. Das Projekt führt eine einzige Unreleased-Sektion mit einem Eintrag pro beobachtbarer Änderung, und die Pakete 1, 4 und 5 haben ihre Zeilen dort bereits abgelegt. Ein Sammeleintrag darüber würde dieselben Änderungen ein zweites Mal behaupten.

### Offene Dokumentationspflicht aus Paket 1

`docs/migration.md` trägt die Dedupe-Anweisung zu COR-002, aber **nicht** den jetzt werfenden `delete` des Marker-Slots. AGENTS.md verlangt für alles, was gegen `v5.1.0` bricht, einen Eintrag dort — mit Grep-Muster und Ersatz. Der Punkt fiel erst beim Abschluss-Check auf, nach Commit und Review von Paket 1; er wurde bewusst nicht nachträglich in ein abgeschlossenes Paket geschoben. Eine Zeile in `docs/migration.md` schließt ihn, Grep-Muster `delete .*Symbol\.for\(['"]eventize['"]\)`.

### Nebenbefunde dieses Laufs

Bewusst nicht behoben, sie gehören ins nächste Audit:

- README und `skills/using-eventize/references/api-details.md` behaupten, `getRetainedCount()` und `getRetainedEventNames()` werfen bei fremdem Marker. Zutreffend, aber nur `getSubscriptionCount()` ist verspect — die Sorte »documented but untested«, die AGENTS.md ausschließt.
- `markAsForeign` und zwei Payload-Fabriken stehen wortgleich in zwei Spec-Dateien; `src/__test-utils__/` existiert dafür.
- `PROTOCOL_VERSION` bleibt intern, wer die neue Diagnose nutzt, schreibt `=== 6` hartkodiert.
- Versiegelt ist die Marker-Property, nicht ihre Nutzlast: `ε[Symbol.for('eventize')].protocol = 5` bleibt erlaubt.
- `detectListenerType(listener)` wird in `_subscribeTo()` weiterhin bis zu zweimal aufgerufen — vorbestehend, keine Regression.
- `coverageThreshold` steht auf 99/98/99/99 bei einem Ist-Stand von 100/98.93/99.29/100. Anheben erst nach TEST-003, so wie das Audit es sortiert.
