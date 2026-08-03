# Remediation-Plan — @spearwolf/eventize

Quelle: `./audit.html` vom 2026-08-03 · Branch: `remediation/audit-2026-08-03` · erstellt: 2026-08-03
Baseline: clean ✓ · build ✓ · typecheck ✓ · attw ✓ · check:dts ✓ · test 905/905 ✓ (100 % Stmts, 98,85 % Branches) · lint ✓ · format:check ✓ — `npm run cbt` Exit 0, keine vorbestehenden Fehler
Scope: 10 von 38 Findings, ausdrücklich per ID benannt (1 high, 3 medium, 4 low, 2 info)

## Scope

Drin: `COR-001`, `API-001`, `ARCH-001`, `COR-002`, `ASYNC-001`, `ASYNC-002`, `PERF-001`, `PERF-002`, `API-003`, `COR-004`.

Draußen, auf Ansage: `API-002` (emitAsync auf `unknown[]`), `COR-003` (Priority einfrieren), `TS-001`, `TS-002`, `TS-003`, `SEC-001` bis `SEC-006`, `BUILD-001` bis `BUILD-003`, `DX-001`, `DX-002`, `DEP-001`, `TEST-001` bis `TEST-006`, `PERF-003`, `PERF-004`, `ASYNC-003`, `ASYNC-004`, `CLEAN-001`.

Draußen, weil zurückgestellt: `ACK-1` bis `ACK-6` aus dem Anhang des Audits. Werden weder geplant noch angetastet.

## Entscheidungen

- **COR-002: Funktions-Targets werden zugelassen** (2026-08-03). `emit(fn, 'foo')` dispatcht künftig auf `fn.foo`. Dazu zieht `dispatchableMember()` zusätzlich `Function.prototype` ab, damit `call`, `bind`, `apply`, `name` und `length` keine Handler werden. Verhaltenserweiterung mit CHANGELOG-Eintrag.
- **ARCH-001: beides, in dieser Reihenfolge** (2026-08-03). Erst die Paritäts-Spec als Netz (Paket 1), danach die Extraktion des geteilten Auflösers dagegen (Paket 6). Der Umbau am heißen Pfad läuft nicht ohne Netz, weil TEST-001 außerhalb des Scopes liegt und die Messwerte im Code von keinem Benchmark reproduziert werden.
- **ASYNC-002: Replay-Fehler werden isoliert** (2026-08-03). Jeder Replay eines Batches läuft in seinem eigenen `try`/`catch`, ein Wurf stoppt die restlichen Replays nicht, und `on()` / `once()` geben ihr Handle zurück. Der Fehler verschwindet dabei nicht: jeder gefangene Wurf wird über den vorhandenen `warn()`-Helfer gemeldet. Die Alternative (propagieren und die Registrierung zurückrollen) ist damit verworfen.
- **COR-004: aktuelles Verhalten bleibt** (2026-08-03). Ein geerbter Marker-Slot teilt einen Emitter über alle Instanzen, und das ist so gewollt. Kein Code-Eingriff; das Verhalten wird dokumentiert und mit einer Spec gepinnt, damit ein späterer Lauf es nicht für einen Defekt hält.

## Vorbestehende Fehler

Keine. Die Baseline ist in allen sieben Stufen des `cbt`-Gates grün.

## Arbeitsbaum

`audit.html` ist gegenüber `HEAD` verändert (der Report dieses Laufs). Wird vor Paket 1 als eigener Commit abgesetzt, damit keine Paket-Diffs damit vermischt werden.

## Verify

Projektgate ist `npm run cbt`. Es räumt zuerst auf (inklusive ts-jest-Cache, siehe AGENTS.md) und ist die einzige Stelle, an der `coverageThreshold` bindet. Enge Schleifen laufen über `npm test -- <datei>`; committet wird erst nach einem vollen `cbt`, sobald ein Paket Quellen unter `src/` berührt.

## Pakete

### [ ] 1. Parität der beiden Dispatch-Pfade festschreiben

- Findings: ARCH-001 (Teil 1 von 2)
- Ziel: Eine Spec vergleicht für dieselbe Ziel-Form den eventisierten und den duck-typed Dispatch, damit Paket 3 und Paket 6 ein Netz haben.
- Dateien: `src/dispatch-parity.spec.ts` (neu)
- Modell: mittlere Stufe
- Verify: `npm test -- src/dispatch-parity && npm run typecheck`
- Commit: `test(dispatch): pin parity between the eventized and duck-typed dispatch paths (ARCH-001)`
- Hash: —

**ARCH-001 · medium · src/eventize-api.ts:177-223 gegen src/EventListener.ts:66-99 und :330-396** — Der Duck-Dispatch ist eine zweite Implementierung von EventListener.apply()

Beide Pfade lösen dieselbe Kette: `'*'` abweisen, Member über `dispatchableMember()` auflösen, sonst auf `.emit()` mit `prependEventName()` zurückfallen, Rückgabewerte durch denselben `returnValue`-Callback schleusen. Geteilt wird davon nichts außer den zwei Helfern in `utils.ts`, die Kette selbst steht zweimal da. AGENTS.md schreibt den Gleichlauf als Regel fest, durchgesetzt wird er von einem Kommentar in `emit-ducktyping.spec.ts:182`. COR-002 ist eine Stelle, an der die beiden schon auseinanderlaufen.

Auftrag für dieses Paket, nur der Netz-Teil:

Eine neue Spec, die eine Tabelle von Ziel-Formen zweimal durchspielt: einmal als nicht-eventisiertes Objekt über `emit(target, …)` (Duck-Pfad), einmal als eventisiertes Objekt mit demselben Objekt als Listener über `on(ε, obj)` (Listener-Pfad). Verglichen wird, welche Methode mit welchen Argumenten gerufen wurde und was `emitAsync()` aggregiert. Mindestens diese Formen: eigene Methode unter dem Event-Namen; nur ein `.emit()`-Fallback; beides gleichzeitig (die benannte Methode muss gewinnen); ein Name, der mit einem `Object.prototype`-Member kollidiert (`toString`); der Sonderfall `constructor` an einer Klasseninstanz; überhaupt kein Treffer; ein Member unter dem Event-Namen, das keine Funktion ist.

Zwei Vorgaben, damit die Spec jetzt grün ist und ihren Zweck behält:

- **Nur Objekt-Formen.** Funktions-Targets kommen in Paket 3 dazu, zusammen mit dem Verhalten, das sie dispatchbar macht. Diese Spec darf die heutige Divergenz nicht als Zusicherung festschreiben.
- **Die Spec vergleicht die zwei Pfade gegeneinander**, sie schreibt keine absoluten Erwartungswerte fest, wo ein Vergleich reicht. Ein Kommentar am Kopf nennt AGENTS.md als Quelle der Regel und sagt, dass ein Rot hier bedeutet, dass die beiden Pfade auseinandergelaufen sind.

---

### [ ] 2. off(ε, listenerObject) trifft funktionswertige Listener-Objekte

- Findings: COR-001
- Ziel: Die sweepende `off()`-Form löst auch Subscriptions, deren Listener-Objekt eine Funktion oder Klasse ist.
- Dateien: `src/EventStore.ts`, `src/off.spec.ts`, `CHANGELOG.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `fix(off): match function-valued listener objects in the sweeping off() form (COR-001)`
- Hash: —

**COR-001 · high · src/EventStore.ts:1024 (isObjectListener), Wirkung in src/EventStore.ts:724** — off(ε, listenerObject) trifft funktionswertige Listener-Objekte nicht

`removeByListener()` bestimmt mit `typeof listener === 'object'`, ob der Assoziations-Vergleich in `detachByIdentity()` überhaupt laufen darf. Eine Funktion oder Klasse fällt durch diesen Test, also wird der Zweig `isObjectListener && current.listenerObject === listener` nie erreicht. Empirisch belegt: `on(ε, 'foo', 'reset', Registry)` mit `class Registry`, danach `off(ε, Registry)` lässt `getSubscriptionCount(ε)` auf 1 stehen, und der nächste `emit(ε, 'foo')` ruft `Registry.reset` weiter auf. Dasselbe für `on(ε, 'foo', handler, ctxFn)` mit einer Arrow-Funktion als Kontext. Die zielgerichtete Form `off(ε, 'foo', Registry)` räumt korrekt ab, weil `detachByAssociation()` keinen solchen Typ-Gate hat.

Damit widersprechen sich zwei Dinge, die beide festgeschrieben sind: `docs/off.md:18` verspricht für `off(emitter, listenerObject)` »every subscription associated with that object: the object-alone shape, the method-name shape, the function-with-context shape«, und `src/EventListener.spec.ts:312` pinnt eine Funktion als Listener-Objekt ausdrücklich mit dem Kommentar »The dispatch guard must not narrow that away«. Der Dispatch narrowt nicht, die Entfernung schon. Folge ist genau der Fehlermodus, den der Doc-Kommentar an `detachByIdentity()` als den schlimmeren der beiden benennt: ein Unsubscribe, das lautlos nichts entfernt, hält die Klasse samt Closure am Emitter und feuert weiter.

Empfehlung: Den Gate auf `typeof listener === 'object' || typeof listener === 'function'` weiten, also dieselbe Menge, die `canReadMembers()` als Listener-Objekt akzeptiert. Spec für beide Formen (Methodenname mit Klasse, Funktion mit Funktions-Kontext) in `off.spec.ts`, plus Eintrag unter »Fixed« in `CHANGELOG.md`. Kein Migrations-Eintrag nötig, gegen v5.1.0 hat diese Form ebenfalls nichts entfernt.

Zusätzlich zu beachten:

- **Test zuerst, rot gesehen.** Beide Formen als fehlschlagende Spec-Fälle, vor der Korrektur.
- Prüfen, ob `off(ε, fn)` dadurch Subscriptions mitnimmt, in denen `fn` der Kontext eines *anderen* Listeners ist. Das ist die gewollte Symmetrie zum Objekt-Fall (siehe den Doc-Kommentar an `detachByIdentity()`, Abschnitt zum akzeptierten Preis), aber es gehört mit einem Spec-Fall festgehalten statt beiläufig eingeführt.
- `docs/off.md` verspricht das Verhalten bereits; die Zeile wird wahr und braucht keine Änderung. Falls beim Lesen auffällt, dass sie den Funktionsfall nicht ausdrücklich nennt, eine Halbzeile ergänzen.

---

### [ ] 3. Funktions-Targets im Duck-Dispatch, Prototyp-Grenze auf Function.prototype

- Findings: COR-002
- Ziel: `emit()` und `emitAsync()` dispatchen auf eine nicht-eventisierte Funktion, ohne deren geerbte `Function.prototype`-Member zu Handlern zu machen.
- Dateien: `src/eventize-api.ts`, `src/utils.ts`, `src/emit-ducktyping.spec.ts`, `src/dispatch-parity.spec.ts`, `CHANGELOG.md`, `README.md`, `skills/using-eventize/references/api-details.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `feat(emit): dispatch to function targets and extend the prototype boundary to Function.prototype (COR-002)`
- Hash: —

**COR-002 · medium · src/eventize-api.ts:225 (isDuckTarget)** — Der Duck-Dispatch verwirft Funktions-Targets lautlos

`isDuckTarget()` verlangt `typeof obj === 'object'`, also ist `emit(fn, 'foo')` auf einer nicht-eventisierten Funktion ein stiller No-op, auch wenn `fn.foo` eine aufrufbare eigene Methode ist. Belegt: `emit(Object.assign(function(){}, {foo}), 'foo', 1)` ruft `foo` nicht auf, `emitAsync` auf demselben Target löst zu `undefined` auf, dieselbe Funktion nach `eventize()` dispatcht normal. Die Bibliothek akzeptiert Funktionen ansonsten überall: `asEventized()` nimmt `typeof === 'function'` ausdrücklich an, und eine Funktion ist ein gepinntes Listener-Objekt. Der Block »non-object targets« in `emit-ducktyping.spec.ts` deckt nur `null` und `undefined` ab, in `docs/` und im Skill steht dazu nichts.

Entscheidung für dieses Paket (siehe Abschnitt Entscheidungen): Funktionen werden zugelassen.

- `isDuckTarget()` akzeptiert zusätzlich `typeof obj === 'function'`.
- `dispatchableMember()` zieht neben `Object.prototype` auch `Function.prototype` ab, nach demselben Identitätstest. Betroffen sind unter anderem `call`, `apply`, `bind`, `toString`, `constructor`, `name` und `length`. `name` und `length` sind Accessor-artige eigene Properties einer Funktion und keine Werte von `Function.prototype`, also durch den Identitätstest **nicht** gedeckt: prüfen, ob `emit(fn, 'name')` dadurch etwas Unerwünschtes tut, und den Befund als Spec-Fall festhalten, so oder so.
- Die neue Grenze läuft auf **jedem** Dispatch, auch dem eventisierten. Der bestehende `undefined`-Shortcut in `dispatchableMember()` bleibt als erste Abfrage stehen, damit der häufigste Fall (kein Member unter dem Namen) keinen zusätzlichen Vergleich zahlt. Der zweite Vergleich kommt nur, wenn ein Member existiert.
- Der Doc-Kommentar an `dispatchableMember()` erklärt die `Object.prototype`-Grenze im Volltext und wird um die zweite Ebene ergänzt, mit derselben Begründung: sonst antwortet jede Funktion auf `call` und `bind`.
- Die Paritäts-Spec aus Paket 1 bekommt die Funktions-Formen dazu, jetzt als Gleichheit statt als Divergenz.
- Doku: `CHANGELOG.md` unter der passenden Rubrik in `## v6.0.0 (unreleased)`. `README.md` und `skills/using-eventize/references/api-details.md` beschreiben die Prototyp-Grenze bereits (api-details.md:114-116) und nennen künftig beide Ebenen. Der Skill muss selbsttragend bleiben, also keine Pfade aus `skills/` heraus.

---

### [ ] 4. onceAsync() wirft Argumentfehler synchron

- Findings: ASYNC-001
- Ziel: Ein Argumentfehler in `onceAsync()` scheitert an der Aufrufstelle statt als Rejection, die ohne `await` den Prozess reißt.
- Dateien: `src/eventize-api.ts`, `src/onceAsync.spec.ts`, `CHANGELOG.md`, `docs/lifecycle.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `fix(onceAsync): throw argument errors synchronously instead of rejecting (ASYNC-001)`
- Hash: —

**ASYNC-001 · low · src/eventize-api.ts:803-827 (once() innerhalb des Promise-Executors, Zeile 813)** — onceAsync() macht aus einem Argumentfehler ein rejected Promise

`once()` wird innerhalb von `new Promise(executor)` aufgerufen, also wird jeder Validierungsfehler zu einer Rejection statt zu einem Throw an der Aufrufstelle. Belegt: `once(ε, [])` wirft synchron, `onceAsync(ε, [])` liefert ein Promise, das mit derselben Meldung rejected. Betroffen sind alle Wurf-Ursachen aus `_subscribeTo()`: leeres Namens-Array, `NaN`-Priorität, nicht dispatchbarer Listener. Ein Aufruf ohne `await` oder `catch`, also das übliche Fire-and-forget beim Registrieren, wird damit zur Unhandled Rejection und reißt unter Nodes Default `--unhandled-rejections=throw` den Prozess mit, statt an der Zeile zu scheitern, in der der Fehler steht.

Empfehlung: Die Argumentprüfung vor den Promise-Konstruktor ziehen, oder die Registrierung außerhalb des Executors machen und nur das Settlement darin. Programmierfehler werfen in dieser Bibliothek überall sonst synchron.

Zusätzlich zu beachten:

- **Test zuerst, rot gesehen**, für mindestens zwei Ursachen (leeres Array, `NaN`-Priorität).
- Die bestehende Reihenfolge im Executor ist nicht beliebig: der `signal.aborted`-Vorabtest, das `resolved`-Flag für einen retainten Replay, der vor dem Anhängen feuert, und die Deklaration von `onAbort` vor `once()` haben je einen Kommentar mit Begründung. Wer die Registrierung herauszieht, muss diese drei Eigenschaften erhalten. Insbesondere: ein retainter Replay ruft den Listener **während** `once()` auf, also muss `resolve` zu diesem Zeitpunkt bereits erreichbar sein.
- Ein abgebrochener Signal-Fall (`signal.aborted === true` beim Aufruf) muss weiter als Rejection kommen, nicht als Wurf. Das ist die Form von `fetch()` und keine Argumentprüfung.
- `docs/lifecycle.md` beschreibt `onceAsync()` samt Abort-Semantik; die neue Zusicherung gehört dort in einen Satz, plus CHANGELOG.

---

### [ ] 5. Retained-Replay-Fehler isolieren

- Findings: ASYNC-002
- Ziel: Ein werfender Replay stoppt die übrigen Replays seines Batches nicht mehr, und der Aufrufer bekommt sein Unsubscribe-Handle.
- Dateien: `src/EventKeeper.ts`, `src/retain.spec.ts`, `src/EventKeeper.spec.ts`, `CHANGELOG.md`, `docs/retain.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `fix(retain): isolate a throwing retained replay from the rest of its batch (ASYNC-002)`
- Hash: —

**ASYNC-002 · low · src/subscribeTo.ts:248-264, src/EventKeeper.ts:70-73** — Ein werfender Retained-Replay lässt seine Subscription stehen

`EventKeeper.publish()` ruft die Replays in Reihe. Wirft einer, propagiert der Fehler durch `subscribeTo()` bis in `on()` oder `once()` hinaus, die restlichen Replays desselben Batches laufen nie, und der Aufrufer bekommt kein Handle, obwohl die Listener bereits registriert sind. Bei einem Mehr-Namen-Aufruf ist damit ein Teil der Namen abonniert und unerreichbar für ein Unsubscribe außer über `off()`. Für einen normalen `emit()` ist ein werfender Listener geklärt und gepinnt; für den Replay-Pfad ist die Frage offen.

Entscheidung für dieses Paket (siehe Abschnitt Entscheidungen): isolieren.

- Jeder Replay läuft in seinem eigenen `try`/`catch`. Ein Wurf beendet den Batch nicht.
- Jeder gefangene Wurf wird über den vorhandenen `warn()`-Helfer aus `src/utils.ts` gemeldet, mit dem Event-Namen. Still verschwinden darf keiner.
- `on()` und `once()` geben ihr Handle zurück, die Registrierung bleibt vollständig.
- Der Unterschied zum normalen `emit()` ist damit gewollt und gehört benannt: bei einem `emit()` propagiert ein werfender Listener zum Aufrufer, der das Ereignis ausgelöst hat; beim Replay hat der Aufrufer von `on()` den Wert nicht verursacht.
- Spec-Fälle: ein Batch aus mehreren Namen, bei dem der erste Replay wirft, prüft dass die späteren gelaufen sind, dass das Handle zurückkam und funktioniert, und dass `warn` gerufen wurde. Dazu der Einzelfall mit genau einem Replay.
- `docs/retain.md` bekommt den Absatz, `CHANGELOG.md` den Eintrag. Die Interaktion mit einem `once()`, dessen Obligation im werfenden Replay bereits gesettelt wurde, gehört geprüft und als Spec-Fall festgehalten: `EventListener.apply()` ruft `callAfterApply` erst **nach** dem Dispatch, ein Wurf im Listener überspringt es also, und das Verhalten »ein werfender Listener behält seinen One-Shot« ist laut AGENTS.md gewollt.

---

### [ ] 6. Geteilter Auflöser für beide Dispatch-Pfade

- Findings: ARCH-001 (Teil 2 von 2)
- Ziel: Die dreistufige Auflösung steht einmal, und beide Dispatch-Pfade rufen sie auf.
- Dateien: `src/utils.ts`, `src/EventListener.ts`, `src/eventize-api.ts`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `refactor(dispatch): resolve both dispatch paths through one shared helper (ARCH-001)`
- Hash: —

Finding-Volltext siehe Paket 1. Dieses Paket ist die Extraktion, mit der Paritäts-Spec aus Paket 1 und den Funktions-Formen aus Paket 3 als Netz.

- Ein Helfer in `src/utils.ts`, der ein Target, einen Event-Namen, die Argumente und den optionalen `returnValue`-Callback nimmt, über `dispatchableMember()` auflöst, sonst auf `.emit()` mit `prependEventName()` zurückfällt, und zurückgibt, ob überhaupt etwas gerufen wurde. Dieses Boolean ist lasttragend: `EventListener.apply()` entscheidet daran, ob ein `once()` verbraucht ist.
- Aufgerufen wird er vom `LISTENER_IS_OBJ`-Zweig in `EventListener.apply()` und von `_duckEmitOne()`.
- **Was nicht in den Helfer wandert:** der `'*'`-Wurf (steht in `_emitOne()` und `_duckEmitOne()` und muss dort bleiben, damit die dokumentierte Teil-Dispatch-Asymmetrie bei einem Namens-Array unverändert bleibt), die `isObjListener()`-Prüfung und der `isCatchEmAll || eventName`-Test in `apply()`, sowie das Lesen des Watermark vor dem Dispatch.
- **Der heiße Pfad ist die Einschränkung.** Der Doc-Kommentar an `EventStore.forEach()` erklärt, dass die Größe dieser Funktion darüber entscheidet, ob ihr Aufrufer sie inlinet, und `mergeWalk()` liegt aus genau diesem Grund auf Modulebene. `apply()` steht unter demselben Druck. Der Helfer soll deshalb eine flache Modulfunktion sein, kein Closure-Fabrik und kein Objekt mit Optionen. Kommt der Subagent zu dem Ergebnis, dass die Extraktion `apply()` messbar verändert oder eine Prüfung duplizieren müsste, um zu passen, ist das ein Grund, das Paket blockiert zu melden statt es zu erzwingen: die Paritäts-Spec aus Paket 1 ist dann der bleibende Nutzen.
- Rein interner Refactor, also laut AGENTS.md keine Doku-Pflicht. Kein CHANGELOG-Eintrag.

---

### [ ] 7. internalsOf() einmal pro emit(), nicht pro Event-Namen

- Findings: PERF-001
- Ziel: Ein `emit()` mit Namens-Array liest den Marker einmal statt einmal pro Namen.
- Dateien: `src/eventize-api.ts`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `perf(emit): resolve the internals once per emit() instead of once per event name (PERF-001)`
- Hash: —

**PERF-001 · low · src/eventize-api.ts:151 innerhalb von _emitOne, Aufrufschleife in :162-168** — emit(ε, [a,b,c]) liest den Marker pro Event-Namen neu

`internalsOf()` steht laut eigenem Doc-Kommentar bewusst außer der Reihe, weil es auf jedem Dispatch-Pfad sitzt und der Erfolgsfall »one property load and one compare« kosten muss. `_emitOne()` ruft es selbst auf, und `_emit()` ruft `_emitOne()` pro Namen. Ein `emit(ε, ['a','b','c'])` zahlt damit dreimal Symbol-Property-Load, Protokoll-Vergleich und Objekt-Destrukturierung für denselben Emitter.

Empfehlung: `store` und `keeper` einmal in `_emit()` auflösen und an `_emitOne()` übergeben. Der `'*'`-Wurf bleibt in `_emitOne()`, damit die dokumentierte Teil-Dispatch-Asymmetrie unverändert bleibt.

Zusätzlich zu beachten:

- Die Reihenfolge »erst `'*'` prüfen, dann die Internals lesen« im Einzel-Namen-Fall darf sich nicht so verschieben, dass `emit(ε, '*')` künftig einen Protokollfehler statt der Wildcard-Meldung wirft. Ein Spec-Fall in `marker-integrity.spec.ts` oder `wildcard-emit.spec.ts` hält die Reihenfolge fest, falls noch keiner existiert.
- Der Protokoll-Check ist eine Sicherheitsgrenze, nicht nur ein Cache: er muss weiter bei **jedem** `emit()` laufen, auch bei einem mit leerem Namens-Array. Prüfen, was `emit(ε, [])` heute tut, und dass es sich nicht ändert.

---

### [ ] 8. Subscribe-Pfad: Replay-Queue und Registrar-Closures

- Findings: PERF-002
- Ziel: Ein `on()` ohne retainte Werte allokiert kein Replay-Array und kein Curry-Paar.
- Dateien: `src/subscribeTo.ts`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `perf(subscribe): drop the eager replay array and the curried registrar (PERF-002)`
- Hash: —

**PERF-002 · low · src/subscribeTo.ts:254 (retainedEvents), :199-209 (register), :237-243 (entries)** — Der Subscribe-Pfad allokiert Replay-Array und Curry-Closures für eine fast immer leere Queue

Jedes `on()` und jedes `once()` allokiert unbedingt ein `retainedEvents`-Array, das für jeden Emitter ohne `retain()` leer bleibt und von `EventKeeper.publish()` sofort wieder verworfen wird. Dazu kommt `register` als Curry-Paar, also zwei Closures pro Aufruf statt einer Funktion mit Argumenten. Die Array-Form legt zusätzlich ein `entries`-Array plus ein Tupel pro Namen an und läuft die Namen dreimal durch: `map`, Assertion-Schleife, `map`. Dieselbe Prämisse, auf der `EventKeeper` seine geteilten Stand-ins und `registerEventListener()` seinen `hasRetainedFor()`-Gate baut (die meisten Emitter sehen `retain()` nie), gilt hier nicht.

Empfehlung: `retainedEvents` lazy anlegen, etwa als Rückgabewert von `registerEventListener()` oder über einen Holder, der erst beim ersten Replay ein Array bekommt. `register` durch eine Funktion mit `(prio, event)` ersetzen, so wie `applyListener()` auf dem Emit-Pfad. Die Array-Form auf einen Durchlauf ziehen, der Priorität auflöst und prüft.

Zusätzlich zu beachten:

- **Die Atomizität der Prüfungen bleibt.** Ein `NaN` in einem Tupel muss weiter die ganze Registrierung abweisen, bevor der erste Name abonniert ist. Wer die drei Durchläufe auf einen zieht, darf nicht dabei anfangen zu registrieren, während später noch geprüft wird. Der Kommentar an dieser Stelle nennt genau das als Grund für die Trennung; wenn ein Durchlauf nicht geht, ohne die Atomizität zu verlieren, bleiben es zwei.
- Reihenfolge der Replays: `EventKeeper.publish()` sortiert nach `order`, und ASYNC-004 (außerhalb des Scopes) beschreibt, dass die Array-Form dadurch anders replayt als zwei getrennte Aufrufe. Dieses Paket darf daran nichts ändern; die Fälle in `retain.spec.ts:158-189` pinnen die Reihenfolge.
- Läuft nach Paket 5, das dieselbe Datei und dieselbe Queue berührt. Erst dessen Commit, dann dieses.
- Rein interne Optimierung, kein CHANGELOG-Eintrag.

---

### [ ] 9. Fehlermeldungen von retainClear() und unretain()

- Findings: API-003
- Ziel: Die zwei Meldungen nennen Ursache und Abhilfe und tragen dieselbe Fehlerklasse wie der Rest der Bibliothek.
- Dateien: `src/eventize-api.ts`, `src/emit-ducktyping.spec.ts`, `src/retainClear.spec.ts`, `src/unretain.spec.ts`, `README.md`, `docs/retain.md`, `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `fix(api): retainClear() and unretain() throw a TypeError that names the remedy (API-003)`
- Hash: —

**API-003 · info · src/eventize-api.ts:1074, src/eventize-api.ts:1098** — Zwei Fehlermeldungen bleiben unter dem Niveau des Rests

`retainClear()` und `unretain()` werfen `new Error('object is not eventized')`. Jede andere Fehlerstelle der Bibliothek nennt Ursache und Abhilfe und wählt die passende Klasse: `asEventized()` und `internalsOf()` werfen `TypeError` mit Diagnose, `retain()` und `emit()` werfen `Error` mit einem Satz, der die Regel erklärt. Diese zwei nennen weder das Paket noch was zu tun ist. Die Meldung selbst ist in `README.md:249` und `docs/retain.md:265` als Wortlaut dokumentiert, eine Änderung berührt also die Doku mit.

Empfehlung: Auf `TypeError` mit einem Satz umstellen, der die Abhilfe nennt (`eventize(obj)` oder ein `isEventized()`-Guard davor), und die Doku-Stellen mitziehen.

Zusätzlich zu beachten:

- **Der Wortlaut ist an mindestens drei Stellen gepinnt**, unter anderem `emit-ducktyping.spec.ts:287-293`. Vor der Änderung alle Vorkommen von `object is not eventized` über `src/`, `docs/`, `README.md` und `skills/` suchen und jede einzeln nachziehen. Ein `grep` ist Teil des Auftrags, nicht Kür.
- Die Klassenänderung von `Error` auf `TypeError` ist ein Breaking Change für Code, der auf die Klasse oder den Wortlaut testet. Gehört als solcher ins `CHANGELOG.md` und, weil es gegen `v5.1.0` bricht, mit Grep-Muster in `docs/migration.md`.
- `skills/using-eventize/SKILL.md:86` führt die Tabelle »was passiert bei nicht-eventisierten Objekten« und nennt die Meldung. Mitziehen, und der Skill bleibt selbsttragend.

---

### [ ] 10. Geerbter Marker-Slot: Verhalten dokumentieren und pinnen

- Findings: COR-004
- Ziel: Dass ein eventisierter Prototyp seinen Emitter mit allen Instanzen teilt, steht dokumentiert und ist von einer Spec gehalten.
- Dateien: `src/isEventized.ts`, `src/marker-integrity.spec.ts`, `README.md`, `skills/using-eventize/references/api-details.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `docs(marker): state that an inherited marker slot shares one emitter across instances (COR-004)`
- Hash: —

**COR-004 · info · src/isEventized.ts:17-20, src/asEventized.ts:10-21** — Ein geerbter Marker-Slot teilt einen Emitter über alle Instanzen

`isEventized()` liest `obj[NAMESPACE]` und folgt dabei der Prototypenkette. Ist ein Prototyp eventisiert, meldet jede Instanz `true`, `asEventized()` gibt sie unverändert zurück, und alle Instanzen teilen einen Store und einen Keeper. Ein `emit()` auf einer Instanz erreicht die Listener aller anderen. Erreichbar über `eventize(SomeClass.prototype)` oder über ein eventisiertes Objekt als Prototyp.

Entscheidung für dieses Paket (siehe Abschnitt Entscheidungen): das Verhalten bleibt und wird dokumentiert.

- **Kein Eingriff in `isEventized()` oder `asEventized()`.** Der Guard folgt der Prototypenkette weiter.
- Doc-Kommentar an `isEventized()`: der Slot wird geerbt, deshalb ist ein eventisierter Prototyp ein geteilter Emitter, und das ist die Konsequenz aus »der Marker ist eine Property, nicht ein Eintrag in einer Registry«. Ein Satz dazu, dass das nutzbar ist (ein Emitter für eine ganze Klasse) und wann es überrascht.
- Spec in `marker-integrity.spec.ts`: ein eventisierter Prototyp, zwei Instanzen, `on()` auf der einen, `emit()` auf der anderen, der Listener feuert. Dazu, dass `getSubscriptionCount()` für beide Instanzen denselben Wert meldet.
- `README.md` und `skills/using-eventize/references/api-details.md` (dort der `isEventized()`-Abschnitt ab Zeile 198) bekommen je einen Satz. Der Skill bleibt selbsttragend.
- Kein Verhaltenswechsel, also kein CHANGELOG-Eintrag unter »Fixed« oder »Breaking«; eine Zeile unter der Doku-Rubrik, falls es eine gibt.

---

### [ ] 11. on() und once() aus einer Overload-Quelle

- Findings: API-001
- Ziel: Der Overload-Satz von `on()` und `once()` steht einmal, nicht zweimal handgepflegt.
- Dateien: `src/types.ts`, `src/eventize-api.ts`, `src/types.spec.ts`, `src/typed-events.spec.ts`, `src/api-surfaces.spec.ts`, `CHANGELOG.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `refactor(types): declare on() and once() from one shared overload interface (API-001)`
- Hash: —

**API-001 · medium · src/eventize-api.ts:266-497 und src/eventize-api.ts:508-743** — on() und once() tragen zwei handgepflegte Kopien desselben Overload-Satzes

Die beiden Overload-Blöcke sind identisch. Ein Diff der beiden Bereiche mit normalisiertem Funktionsnamen ergibt 26 abweichende Zeilen, davon alle aus Prettier-Umbrüchen und einem gekürzten Kommentar. Zusammen sind das 466 der 1109 Zeilen der Datei. Der Kopfkommentar des Blocks warnt selbst: »Diverge here and the three API surfaces start disagreeing at a new place«, und erzwungen wird die Spiegelung von nichts. `types.ts` zeigt die Alternative bereits: `SubscribeFunc<TEvents>` ist ein Interface und bedient `on` und `once` auf beiden Methodenflächen.

Empfehlung: Ein `StandaloneSubscribeFunc`-Interface in `types.ts`, gegen das beide Exporte typisiert werden.

Zusätzlich zu beachten:

- **Dieses Paket läuft zuletzt**, weil es breitflächig dieselbe Datei umschreibt, die Paket 3, 6 und 7 punktuell ändern. Vorher committen, damit deren Diffs lesbar bleiben.
- **Der Preis ist ein Cast pro Funktion.** `eventize.ts` macht genau diesen Cast schon für `SubscribeImpl`; das ist eine andere Grenze als die Ein-Cast-Regel, die AGENTS.md für die Internals zieht, und der Unterschied gehört in den Kommentar am neuen Interface.
- **`npm run check:dts` ist die harte Grenze.** `scripts/checkDeclarationSurface.cjs` erlaubt in den veröffentlichten Deklarationen genau eine Klasse, `Eventize`. Ob `on` als `function`-Overload-Satz oder als `const` mit Interface-Typ emittiert wird, verändert `lib/index.d.ts`; das Skript muss weiter grün sein, und `attw --pack` ebenso.
- **Die Reihenfolge der Overloads ist lasttragend** (spezifisch vor generisch, dazu die Gruppen 1a, 1c, 2t, 1b, 4t, 1 bis 4). Sie muss im Interface identisch erhalten bleiben, sonst wählt TypeScript andere Signaturen. Die Kommentare, die jede Gruppe erklären, wandern mit.
- **`types.spec.ts` und `typed-events.spec.ts` sind die Prüfsteine.** Sie pinnen, welche Aufrufe kompilieren und welche nicht. Beide müssen unverändert grün bleiben; wenn eine Zeile dort angepasst werden muss, ist das ein Signal, dass sich die öffentliche Fläche verschoben hat, und gehört im Report benannt statt stillschweigend nachgezogen.
- Ändert sich die veröffentlichte Signatur nicht, ist es ein interner Refactor ohne CHANGELOG-Eintrag. Ändert sie sich doch, gehört der Unterschied ins CHANGELOG.
