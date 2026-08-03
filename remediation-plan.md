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
- **Die Drei-Argument-Form von `off()` wird exakt, für Funktionen und Objekte** (2026-08-03, aus dem Review von Paket 2). Der Assoziations-Disjunkt in `detachByIdentity()` bekommt ein `&& matchListenerOnly`, läuft also nur noch, wenn der Aufrufer *kein* Listener-Objekt genannt hat. Anlass: die Weitung aus COR-001 hat `off(ε, fn, ctx)` unexakt gemacht, denn für Funktionen lief der Disjunkt vorher nie. Der Fix nimmt diese Regression zurück und behebt in derselben Zeile eine Unexaktheit, die für Objekte schon vor diesem Lauf bestand (`off(ε, obj, ctx)` nahm Registrierungen mit, in denen `obj` nur Kontext eines anderen Listeners war). Damit geht Paket 2 über COR-001 hinaus und braucht einen zweiten CHANGELOG-Eintrag. Verworfen: die Doku an das unexakte Verhalten anpassen, und ein Carve-out nur für Funktionen.
- **Ein lückenhaftes Namens-Array wird abgewiesen** (2026-08-03, aus dem Review von Paket 8). `on(ε, ['a', , 'b'], h)` und `once(ε, new Array(2), h)` werfen künftig mit derselben Meldung wie ein leeres Array und einer eigenen `cause` (`sparse-names`). Anlass: der Umbau in Paket 8 hat Löcher still übersprungen, wo `v5.1.0` einen rohen `TypeError` warf, und damit `once(ε, new Array(2), h)` ein Handle auf nichts und `onceAsync(ε, new Array(2))` ein nie settelndes Promise zurückgegeben — genau die Fehlerform, gegen die der `empty-names`-Guard dreißig Zeilen weiter oben gebaut wurde. Verworfen: den rohen `TypeError` von `v5.1.0` wiederherstellen, und Löcher als bewusste Nachsicht dokumentieren. Verhaltensänderung gegen `v5.1.0`, also CHANGELOG-Eintrag und Spec je betroffener Form.
- **COR-004: aktuelles Verhalten bleibt** (2026-08-03). Ein geerbter Marker-Slot teilt einen Emitter über alle Instanzen, und das ist so gewollt. Kein Code-Eingriff; das Verhalten wird dokumentiert und mit einer Spec gepinnt, damit ein späterer Lauf es nicht für einen Defekt hält.

## Vorbestehende Fehler

Keine. Die Baseline ist in allen sieben Stufen des `cbt`-Gates grün.

## Arbeitsbaum

`audit.html` ist gegenüber `HEAD` verändert (der Report dieses Laufs). Wird vor Paket 1 als eigener Commit abgesetzt, damit keine Paket-Diffs damit vermischt werden.

## Verify

Projektgate ist `npm run cbt`. Es räumt zuerst auf (inklusive ts-jest-Cache, siehe AGENTS.md) und ist die einzige Stelle, an der `coverageThreshold` bindet. Enge Schleifen laufen über `npm test -- <datei>`; committet wird erst nach einem vollen `cbt`, sobald ein Paket Quellen unter `src/` berührt.

## Pakete

### [x] 1. Parität der beiden Dispatch-Pfade festschreiben

- Findings: ARCH-001 (Teil 1 von 2)
- Ziel: Eine Spec vergleicht für dieselbe Ziel-Form den eventisierten und den duck-typed Dispatch, damit Paket 3 und Paket 6 ein Netz haben.
- Dateien: `src/dispatch-parity.spec.ts` (neu)
- Modell: mittlere Stufe
- Verify: `npm run cbt` (statt der engen Schleife, weil zwei Agenten Mutationen an Produktionsquellen angelegt und zurückgerollt hatten) — Exit 0, 34 Suiten, 922 Tests
- Commit: `test(dispatch): pin parity between the eventized and duck-typed dispatch paths`
- Hash: `76db6bc`

Ergebnis: 17 neue Tests. Eine Korrekturrunde nötig, drei `wichtig` und vier `klein`, alle behoben und im Re-Review bestätigt, zwei davon durch unabhängige Mutation. Der Review-Lauf hat ausserdem drei Divergenzen benannt, die diese Spec **nicht** fängt, deren Netz aber anderswo liegt: »Helfer meldet gerufen, obwohl nichts lief« (jetzt durch den neuen absoluten Fall hier abgedeckt), der `'*'`-Wurf (ebenfalls ergänzt) und die Aggregation nullischer Rückgabewerte (`emitAsync.spec.ts`). Paket 6 kann sich auf die Datei stützen.

**ARCH-001 · medium · src/eventize-api.ts:177-223 gegen src/EventListener.ts:66-99 und :330-396** — Der Duck-Dispatch ist eine zweite Implementierung von EventListener.apply()

Beide Pfade lösen dieselbe Kette: `'*'` abweisen, Member über `dispatchableMember()` auflösen, sonst auf `.emit()` mit `prependEventName()` zurückfallen, Rückgabewerte durch denselben `returnValue`-Callback schleusen. Geteilt wird davon nichts außer den zwei Helfern in `utils.ts`, die Kette selbst steht zweimal da. AGENTS.md schreibt den Gleichlauf als Regel fest, durchgesetzt wird er von einem Kommentar in `emit-ducktyping.spec.ts:182`. COR-002 ist eine Stelle, an der die beiden schon auseinanderlaufen.

Auftrag für dieses Paket, nur der Netz-Teil:

Eine neue Spec, die eine Tabelle von Ziel-Formen zweimal durchspielt: einmal als nicht-eventisiertes Objekt über `emit(target, …)` (Duck-Pfad), einmal als eventisiertes Objekt mit demselben Objekt als Listener über `on(ε, obj)` (Listener-Pfad). Verglichen wird, welche Methode mit welchen Argumenten gerufen wurde und was `emitAsync()` aggregiert. Mindestens diese Formen: eigene Methode unter dem Event-Namen; nur ein `.emit()`-Fallback; beides gleichzeitig (die benannte Methode muss gewinnen); ein Name, der mit einem `Object.prototype`-Member kollidiert (`toString`); der Sonderfall `constructor` an einer Klasseninstanz; überhaupt kein Treffer; ein Member unter dem Event-Namen, das keine Funktion ist.

Zwei Vorgaben, damit die Spec jetzt grün ist und ihren Zweck behält:

- **Nur Objekt-Formen.** Funktions-Targets kommen in Paket 3 dazu, zusammen mit dem Verhalten, das sie dispatchbar macht. Diese Spec darf die heutige Divergenz nicht als Zusicherung festschreiben.
- **Die Spec vergleicht die zwei Pfade gegeneinander**, sie schreibt keine absoluten Erwartungswerte fest, wo ein Vergleich reicht. Ein Kommentar am Kopf nennt AGENTS.md als Quelle der Regel und sagt, dass ein Rot hier bedeutet, dass die beiden Pfade auseinandergelaufen sind.

Kleine Befunde aus dem Review, in Runde 1 mit erledigt oder bewusst gelassen:

- Der Kopfkommentar zählt den `'*'`-Wurf zu dem, was die Spec festschreibt; dazu gibt es keinen Fall (per Mutation belegt). Entweder Fall ergänzen oder den Halbsatz streichen.
- Der Kopfkommentar behauptet, jede Assertion vergleiche Pfad gegen Pfad; rund ein Dutzend sind absolute Anker, und vier Zeilen später steht auch, warum sie es sein müssen. Der Satz ist der Fehler, nicht die Anker.
- Zwei Fälle prüfen nur `not.toThrow()` ohne Recorder. Ein Recorder unter dem unbeteiligten Namen kostet zwei Zeilen.
- Der Kopfkommentar zitiert Zeilennummern aus `EventListener.ts` und `eventize-api.ts`, also genau aus den Dateien, die Paket 3 und Paket 6 umbauen. Funktionsnamen stehen daneben und reichen.

---

### [x] 2. off(ε, listenerObject) trifft funktionswertige Listener-Objekte

- Findings: COR-001, plus die Verengung der Drei-Argument-Form aus dem Review (siehe Entscheidungen)
- Ziel: Die sweepende `off()`-Form löst auch Subscriptions, deren Listener-Objekt eine Funktion oder Klasse ist.
- Dateien: `src/EventStore.ts`, `src/off.spec.ts`, `CHANGELOG.md`, `docs/off.md`, `docs/migration.md`, `docs/lifecycle.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/{api-details,lifecycle,migration}.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 929 Tests (+7)
- Commit: `fix(off): match function-valued listener objects, and narrow the three-argument form`
- Hash: `b6a7d3f`

Ergebnis: drei Runden. Runde 1 (derselbe Implementierer) für die Verengung der Drei-Argument-Form plus zwei Kleinigkeiten. Runde 2 (frischer Implementierer) für drei Doku-Fehler, darunter die Behauptung, die zielgerichtete Form habe bis v5.1.0 funktioniert — sie widersprach einer eigenen Fixed-Zeile im CHANGELOG. Runde 3 (günstigste Stufe, reine Transkription) für drei Prosa-Sätze; die Zwei-Runden-Grenze wurde dafür auf Nutzerentscheidung überschritten, weil sonst ein verifizierter High-Fix samt 24 Tests für drei Sätze eingelagert worden wäre.

Belastbar geprüft: ein Reviewer hat v5.1.0 per `git archive` aus `155e51e` gebaut und tatsächlich laufen lassen, um die historischen Aussagen zu messen statt sie zu lesen. Ergebnis in Kurzform: `off(ε, 'shutdown', Registry)` traf in v5.1.0 nicht, `off(ε, 'evt', obj)` traf, `off(ε, obj, ctx)` nahm Fremdkontext mit, `off(ε, fn, ctx)` war exakt.

Offene Kleinigkeiten, bewusst nicht in diesem Paket behoben, gehören ins nächste Audit:

- Die Lebenszyklus-Tabellen tragen die Funktions-Weitung nur in der `listenerFunc`-Zeile; die `listenerObject`-Zeile darunter sagt weiter »every subscription of that object«, ohne zu nennen, dass dieses Objekt eine Funktion oder Klasse sein darf.
- `CHANGELOG.md` sagt an einer Stelle »so nothing addressed one registration on its own«. Das Handle aus `on()` tat es immer; gemeint ist »keine identitätsbasierte `off()`-Schreibweise«.
- `isObjectListener` im Disjunkt ist statisch redundant, zur Laufzeit aber nicht: ein Primitive kann über `on(ε, 'foo', 'toFixed', 42)` in den Slot geraten, und der Vorfilter ist die Zeile, die »per Identität nicht entfernbar« wahr macht. Wer ihn später als Aufräumkandidaten liest, bricht eine Zusicherung.

Nebenbefund für das nächste Audit, außerhalb jedes Pakets: `on(ε, 'foo', 'toFixed', 42)` registriert und dispatcht auf `Number.prototype`, weil `canReadMembers()` jedes nicht-nullische Value durchlässt, und `off(ε, 42)` bekommt es nicht wieder los. Untypisiert erreichbar, deshalb kein Compile-Fehler.

**COR-001 · high · src/EventStore.ts:1024 (isObjectListener), Wirkung in src/EventStore.ts:724** — off(ε, listenerObject) trifft funktionswertige Listener-Objekte nicht

`removeByListener()` bestimmt mit `typeof listener === 'object'`, ob der Assoziations-Vergleich in `detachByIdentity()` überhaupt laufen darf. Eine Funktion oder Klasse fällt durch diesen Test, also wird der Zweig `isObjectListener && current.listenerObject === listener` nie erreicht. Empirisch belegt: `on(ε, 'foo', 'reset', Registry)` mit `class Registry`, danach `off(ε, Registry)` lässt `getSubscriptionCount(ε)` auf 1 stehen, und der nächste `emit(ε, 'foo')` ruft `Registry.reset` weiter auf. Dasselbe für `on(ε, 'foo', handler, ctxFn)` mit einer Arrow-Funktion als Kontext. Die zielgerichtete Form `off(ε, 'foo', Registry)` räumt korrekt ab, weil `detachByAssociation()` keinen solchen Typ-Gate hat.

Damit widersprechen sich zwei Dinge, die beide festgeschrieben sind: `docs/off.md:18` verspricht für `off(emitter, listenerObject)` »every subscription associated with that object: the object-alone shape, the method-name shape, the function-with-context shape«, und `src/EventListener.spec.ts:312` pinnt eine Funktion als Listener-Objekt ausdrücklich mit dem Kommentar »The dispatch guard must not narrow that away«. Der Dispatch narrowt nicht, die Entfernung schon. Folge ist genau der Fehlermodus, den der Doc-Kommentar an `detachByIdentity()` als den schlimmeren der beiden benennt: ein Unsubscribe, das lautlos nichts entfernt, hält die Klasse samt Closure am Emitter und feuert weiter.

Empfehlung: Den Gate auf `typeof listener === 'object' || typeof listener === 'function'` weiten, also dieselbe Menge, die `canReadMembers()` als Listener-Objekt akzeptiert. Spec für beide Formen (Methodenname mit Klasse, Funktion mit Funktions-Kontext) in `off.spec.ts`, plus Eintrag unter »Fixed« in `CHANGELOG.md`. Kein Migrations-Eintrag nötig, gegen v5.1.0 hat diese Form ebenfalls nichts entfernt.

Zusätzlich zu beachten:

- **Test zuerst, rot gesehen.** Beide Formen als fehlschlagende Spec-Fälle, vor der Korrektur.
- Prüfen, ob `off(ε, fn)` dadurch Subscriptions mitnimmt, in denen `fn` der Kontext eines *anderen* Listeners ist. Das ist die gewollte Symmetrie zum Objekt-Fall (siehe den Doc-Kommentar an `detachByIdentity()`, Abschnitt zum akzeptierten Preis), aber es gehört mit einem Spec-Fall festgehalten statt beiläufig eingeführt.
- `docs/off.md` verspricht das Verhalten bereits; die Zeile wird wahr und braucht keine Änderung. Falls beim Lesen auffällt, dass sie den Funktionsfall nicht ausdrücklich nennt, eine Halbzeile ergänzen.

---

### [x] 3. Funktions-Targets im Duck-Dispatch, Prototyp-Grenze auf Function.prototype

- Findings: COR-002, plus der `__proto__`-Carve-out und die Snapshot-Form aus dem Review
- Ziel: `emit()` und `emitAsync()` dispatchen auf eine nicht-eventisierte Funktion, ohne deren geerbte `Function.prototype`-Member zu Handlern zu machen.
- Dateien: `src/eventize-api.ts`, `src/utils.ts`, `src/emit-ducktyping.spec.ts`, `src/EventListener.spec.ts`, `src/dispatch-parity.spec.ts`, `CHANGELOG.md`, `README.md`, `docs/migration.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/{api-details,migration}.md`
- Modell: stärkste Stufe (Runde 2 auf mittlerer Stufe, nach Aufgabe statt nach Regel — der Vorgänger war an diesen zwei Punkten nicht gescheitert)
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 965 Tests (+36)
- Commit: `feat(emit): dispatch to function targets, and subtract Function.prototype`
- Hash: `35a5372`

Ergebnis: zwei Runden, beide Blocker aus dem Review behoben.

- **`__proto__`** riss die neue Grenze auf: auf einem Funktions-Target liefert `dispatchableMember(fn, '__proto__')` `Function.prototype`, und das ist aufrufbar. `emit(fn, '__proto__')` rief es als Handler auf und verschluckte den `.emit()`-Fallback; `emit(Sub, '__proto__')` warf den Klassen-Konstruktor-TypeError. Behoben als unbedingter Carve-out neben `constructor`, vier Spec-Fälle. Selbst nachgeprüft: alle vier Kanten greifen, der Fallback wird erreicht, und ein per `defineProperty` gesetzter eigener `__proto__`-Handler wird übersprungen (gewollt, wie bei `constructor`).
- **Die Snapshot-Form** stand im Dictionary-Mode. `Object.create(null)` kostet die Fast Properties: selbst gemessen 1,38 ns gegen 7,78–8,25 ns im Treffer-Fall, `%HasFastProperties` `true` gegen `false`. Ersetzt durch ein Objektliteral, das dieselbe `Reflect.ownKeys`-Schleife füllt. Semantik unverändert, selbst verifiziert: der Snapshot besitzt genau `length, name, constructor, apply, bind, call, toString, Symbol.hasInstance`, und für jeden anderen Namen liefert er denselben Wert, gegen den eine Zeile früher schon verglichen wurde. Beide Messreihen stehen jetzt im Doc-Kommentar, nach Hausmethode als Bereiche.

Gemessene Eigenheiten, bewusst so gepinnt statt behoben: `emit(fn, 'arguments')` und `emit(fn, 'caller')` werfen aus dem Dispatch heraus, aber nur für Strict-Mode-Funktionen — im Sloppy-Mode liefert der Read `null` und der Aufruf landet im Fallback (selbst nachgeprüft). Der Member-Read passiert vor jeder Grenze, eine Grenze kann das also nicht abfangen. `name` und `length` sind eigene Properties und nicht aufrufbar, landen also im Fallback. `fn.prototype` bleibt nur dann als Handler erreichbar, wenn jemand selbst eine Funktion hineinschreibt: ein eigenes Member, keine Engine-Lücke, deshalb kein Carve-out.

Offene Kleinigkeit für das nächste Audit: `skills/using-eventize/references/migration.md` trägt für das Item zu klassenförmigen Targets keinen Grep-Hinweis, während `docs/migration.md` einen hat. Der Skill fällt an dieser Stelle hinter `docs/` zurück. Das rg-Muster dort behält bewusst seine Über-Inklusion, weil `rg` ohne `--pcre2` kein Lookbehind akzeptiert; der Begleittext sagt das jetzt.

**COR-002 · medium · src/eventize-api.ts:225 (isDuckTarget)** — Der Duck-Dispatch verwirft Funktions-Targets lautlos

`isDuckTarget()` verlangt `typeof obj === 'object'`, also ist `emit(fn, 'foo')` auf einer nicht-eventisierten Funktion ein stiller No-op, auch wenn `fn.foo` eine aufrufbare eigene Methode ist. Belegt: `emit(Object.assign(function(){}, {foo}), 'foo', 1)` ruft `foo` nicht auf, `emitAsync` auf demselben Target löst zu `undefined` auf, dieselbe Funktion nach `eventize()` dispatcht normal. Die Bibliothek akzeptiert Funktionen ansonsten überall: `asEventized()` nimmt `typeof === 'function'` ausdrücklich an, und eine Funktion ist ein gepinntes Listener-Objekt. Der Block »non-object targets« in `emit-ducktyping.spec.ts` deckt nur `null` und `undefined` ab, in `docs/` und im Skill steht dazu nichts.

Entscheidung für dieses Paket (siehe Abschnitt Entscheidungen): Funktionen werden zugelassen.

- `isDuckTarget()` akzeptiert zusätzlich `typeof obj === 'function'`.
- `dispatchableMember()` zieht neben `Object.prototype` auch `Function.prototype` ab, nach demselben Identitätstest. Betroffen sind unter anderem `call`, `apply`, `bind`, `toString`, `constructor`, `name` und `length`. `name` und `length` sind Accessor-artige eigene Properties einer Funktion und keine Werte von `Function.prototype`, also durch den Identitätstest **nicht** gedeckt: prüfen, ob `emit(fn, 'name')` dadurch etwas Unerwünschtes tut, und den Befund als Spec-Fall festhalten, so oder so.
- Die neue Grenze läuft auf **jedem** Dispatch, auch dem eventisierten. Der bestehende `undefined`-Shortcut in `dispatchableMember()` bleibt als erste Abfrage stehen, damit der häufigste Fall (kein Member unter dem Namen) keinen zusätzlichen Vergleich zahlt. Der zweite Vergleich kommt nur, wenn ein Member existiert.
- Der Doc-Kommentar an `dispatchableMember()` erklärt die `Object.prototype`-Grenze im Volltext und wird um die zweite Ebene ergänzt, mit derselben Begründung: sonst antwortet jede Funktion auf `call` und `bind`.
- **Korrektur aus dem Review von Paket 1 (2026-08-03):** Die Funktions-Formen kommen **nicht** als Paritäts-Fälle in `dispatch-parity.spec.ts`. Parität ist dort strukturell unerreichbar, und zwar unabhängig von diesem Paket: `on(ε, fn)` tagt `fn` über `detectListenerType()` als `LISTENER_IS_FUNC`, der erste Zweig in `apply()` ruft also `fn` selbst, und `isObjListener()` verlangt `typeof === 'object'`. Es gibt keine Listener-Objekt-Form, die Member auf einer Funktion auflöst. Die Ausnahme ist die Methodennamen-Form `on(ε, 'foo', 'reset', SomeClass)`, die über `canReadMembers()` läuft und deshalb nichts mit dem Objekt-Zweig zu tun hat. Die Funktions-Fälle dieses Pakets gehören daher nach `emit-ducktyping.spec.ts` als absolute Fälle des Duck-Pfads, nicht in die Paritäts-Spec. Wer den Kommentarkopf der Paritäts-Spec anfasst, korrigiert dort auch die Begründung des Funktions-Ausschlusses.
- Doku: `CHANGELOG.md` unter der passenden Rubrik in `## v6.0.0 (unreleased)`. `README.md` und `skills/using-eventize/references/api-details.md` beschreiben die Prototyp-Grenze bereits (api-details.md:114-116) und nennen künftig beide Ebenen. Der Skill muss selbsttragend bleiben, also keine Pfade aus `skills/` heraus.

---

### [x] 4. onceAsync() wirft Argumentfehler synchron

- Findings: ASYNC-001
- Ziel: Ein Argumentfehler in `onceAsync()` scheitert an der Aufrufstelle statt als Rejection, die ohne `await` den Prozess reißt.
- Dateien: `src/eventize-api.ts`, `src/onceAsync.spec.ts`, `CHANGELOG.md`, `docs/lifecycle.md`, `skills/using-eventize/references/{api-details,lifecycle}.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 968 Tests (+3)
- Commit: `fix(onceAsync): throw argument errors synchronously instead of rejecting`
- Hash: `015a62a`

Ergebnis: eine Runde. Der rote Lauf vor dem Fix hat den ganzen Jest-Prozess mitgerissen statt einen Test rot zu färben — genau der Unhandled-Rejection-Effekt, den das Finding beschreibt, schärfer als erwartet.

Gefunden und als Rand gepinnt statt behoben: `onceAsync(ε, [], {signal: bereitsAbgebrochen})` verschluckt den Argumentfehler und rejectet mit der Abbruch-Reason, weil der Abort-Vorabtest vor der Validierung steht. Das Umstellen wurde geprüft und verworfen: `once()` vorher laufen zu lassen registriert eine echte Subscription, und ein retainter Replay könnte das Promise aus ihr heraus mit einem Wert auflösen, den der Aufrufer längst abbestellt hat. Eine Validierung ohne Registrierung gäbe es nur, indem die Prüfungen aus `_subscribeTo()` ein zweites Mal hier stehen, was AGENTS.md als Forken einer Fläche verbietet. Der Reviewer hat den neuen Spec-Fall durch eine Umstellungs-Mutation gegengeprüft: genau dieser Fall wird rot, kein anderer fängt sie.

Die vier lasttragenden Eigenschaften des alten Executors sind erhalten und einzeln nachgemessen: Abort-Vorabtest als Rejection, retainter Wert löst auch bei spätem `await` auf, dabei kein Abort-Listener registriert (`addCount === 0`), normales Feuern entfernt ihn wieder (`addCount 1`, `removeCount 1`).

**ASYNC-001 · low · src/eventize-api.ts:803-827 (once() innerhalb des Promise-Executors, Zeile 813)** — onceAsync() macht aus einem Argumentfehler ein rejected Promise

`once()` wird innerhalb von `new Promise(executor)` aufgerufen, also wird jeder Validierungsfehler zu einer Rejection statt zu einem Throw an der Aufrufstelle. Belegt: `once(ε, [])` wirft synchron, `onceAsync(ε, [])` liefert ein Promise, das mit derselben Meldung rejected. Betroffen sind alle Wurf-Ursachen aus `_subscribeTo()`: leeres Namens-Array, `NaN`-Priorität, nicht dispatchbarer Listener. Ein Aufruf ohne `await` oder `catch`, also das übliche Fire-and-forget beim Registrieren, wird damit zur Unhandled Rejection und reißt unter Nodes Default `--unhandled-rejections=throw` den Prozess mit, statt an der Zeile zu scheitern, in der der Fehler steht.

Empfehlung: Die Argumentprüfung vor den Promise-Konstruktor ziehen, oder die Registrierung außerhalb des Executors machen und nur das Settlement darin. Programmierfehler werfen in dieser Bibliothek überall sonst synchron.

Zusätzlich zu beachten:

- **Test zuerst, rot gesehen**, für mindestens zwei Ursachen (leeres Array, `NaN`-Priorität).
- Die bestehende Reihenfolge im Executor ist nicht beliebig: der `signal.aborted`-Vorabtest, das `resolved`-Flag für einen retainten Replay, der vor dem Anhängen feuert, und die Deklaration von `onAbort` vor `once()` haben je einen Kommentar mit Begründung. Wer die Registrierung herauszieht, muss diese drei Eigenschaften erhalten. Insbesondere: ein retainter Replay ruft den Listener **während** `once()` auf, also muss `resolve` zu diesem Zeitpunkt bereits erreichbar sein.
- Ein abgebrochener Signal-Fall (`signal.aborted === true` beim Aufruf) muss weiter als Rejection kommen, nicht als Wurf. Das ist die Form von `fetch()` und keine Argumentprüfung.
- `docs/lifecycle.md` beschreibt `onceAsync()` samt Abort-Semantik; die neue Zusicherung gehört dort in einen Satz, plus CHANGELOG.

---

### [x] 5. Retained-Replay-Fehler isolieren

- Findings: ASYNC-002
- Ziel: Ein werfender Replay stoppt die übrigen Replays seines Batches nicht mehr, und der Aufrufer bekommt sein Unsubscribe-Handle.
- Dateien: `src/EventKeeper.ts`, `src/subscribeTo.ts`, `src/retain.spec.ts`, `src/EventKeeper.spec.ts`, `CHANGELOG.md`, `AGENTS.md`, `docs/retain.md`, `docs/lifecycle.md`, `docs/migration.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/api-details.md`
- Modell: stärkste Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 977 Tests (+9)
- Commit: `fix(retain): isolate a throwing retained replay from the rest of its batch`
- Hash: `09b1fec`

Ergebnis: eine Runde. Der Reviewer hat die Isolierung mit 18 eigenen Proben abgenommen, über `on()`, `once()`, `class Eventize`, `eventize.inject()`, ein Listener-Objekt und `on(ε, '*')`.

Zwei Dinge, die über das Finding hinausgehen und bewusst so stehen:

- **`AGENTS.md` hat einen neuen Eintrag unter »Known asymmetries«.** `EventKeeper.publish()` ist ab jetzt die einzige Stelle der Bibliothek, die einen Dispatch-Fehler schluckt. Der Reviewer hat den Eintrag geprüft und als zulässig und geboten beurteilt: er setzt Regeln statt Verhalten zu beschreiben und nennt keine Spec-Datei, wie die Datei es von sich selbst verlangt.
- **Ein `once()`, dessen Replay wirft, settelt nichts** und kann im selben Batch ein zweites Mal feuern. Gemessen: bei drei Namen und zwei werfenden Replays feuert der Handler dreimal; werfen alle, bleibt die Subscription scharf. Das ist kein Defekt, sondern der Schnittpunkt zweier einzeln gewollter Entscheidungen (der werfende Listener behält seinen One-Shot, der Batch läuft weiter). Die Erklärung steht jetzt an beiden Enden, am Obligation-Guard in `subscribeTo.ts` und an `publish()` — der Guard versprach vorher wörtlich das Gegenteil.

Weiter gemessen und dokumentiert: der `try` umschließt alles, was der Replay synchron auslöst, die Warnung nennt deshalb den replayten Namen und das mitgeloggte Error-Objekt die Quelle. Vier Doku-Stellen sagten »catches«, wo »swallows« gemeint war, und nennen jetzt `emitAsync()`s Catch als das, was er ist: Anspruch auf die gesammelten Promises, danach unverändert weiter.

Hinweis für Paket 8: `KeeperEvent` trägt jetzt ein Feld `eventName`, das die Warnung braucht. Wer die Replay-Queue lazy macht, muss es mitführen. Gebaut wird `KeeperEvent` an genau einer Stelle, `EventKeeper.replayTo()`, plus einem Literal in `EventKeeper.spec.ts`.

Hinweis für Paket 9: `warn` bindet `console.warn` beim Modulladen, ein `jest.spyOn(console, 'warn')` sieht den Aufruf also nie. Wer dort eine Meldung pinnen will, braucht denselben Modul-Mock wie `retain.spec.ts` und `EventKeeper.spec.ts`.

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

### [x] 6. Geteilter Auflöser für beide Dispatch-Pfade

- Findings: ARCH-001 (Teil 2 von 2)
- Ziel: Die dreistufige Auflösung steht einmal, und beide Dispatch-Pfade rufen sie auf.
- Dateien: `src/utils.ts`, `src/EventListener.ts`, `src/eventize-api.ts`, `src/dispatch-parity.spec.ts` (nur Kopfkommentar)
- Modell: stärkste Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 977 Tests, unverändert zur Vorlage
- Commit: `refactor(dispatch): resolve both dispatch paths through one shared helper`
- Hash: `bdda586`

Ergebnis: `FERTIG_MIT_VORBEHALT` statt Abbruch, und der Vorbehalt ist beziffert. Der Helfer heißt `dispatchToTarget()` und steht auf `invokeListener()` plus `emitFallback()`, den zwei Funktionen, die `EventListener.apply()` ohnehin schon rief. Drei flache Modulfunktionen, keine Closure-Fabrik.

Messung des Implementierers, 25 Prozesse je Zelle, interleaved und in umgekehrter Reihenfolge wiederholt: der Listener-Pfad bewegt sich in keinem seiner drei Workloads. Der Duck-Pfad zahlt an zwei Zellen, rund 0,2 ns am `.emit()`-Fallback und rund 0,38 ns an einem Dispatch, der nichts beantwortet, weil er die Kette bisher inline hatte. Beide Zahlen stehen mit Methode und Fallen im Doc-Kommentar. Zwei Sackgassen sind dokumentiert: eine sequenzielle erste Messreihe meldete 10 % Regression, die interleaved verschwand (die Maschine wurde zwischen den Hälften langsamer), und eine Bimodalität auf dem Miss-Pfad, die nach zwei weiteren Reihen verschwand und deshalb bewusst **nicht** als Tatsache im Kommentar steht.

Der Beleg für die Verhaltensgleichheit kam vom Reviewer und ist der stärkste dieses Laufs: ein Bundle aus `HEAD` gegen das neue, beide durch eine Matrix aus 21 Target-Formen über drei Aufrufwege geschickt, inklusive Prototyp-Grenznamen, Alias-Kanten, vergifteter Accessoren und werfender Handler. 2636 Zeilen Trace, identisch. Dazu `lib/index.d.ts` byteweise gleich, die veröffentlichte Fläche ist also unberührt, und der lasttragende Rückgabewert reißt unter Mutation in beide Richtungen 28 beziehungsweise 22 Tests auf.

An ihrer Stelle geblieben, wie der Plan verlangt: der `'*'`-Wurf in beiden Pfaden, `isObjListener()`, der `isCatchEmAll || eventName`-Test und das Lesen des Watermark. Nichts wurde dupliziert, um den Helfer passend zu machen; der Duck-Pfad kommt sogar mit einem Cast statt vier aus und ist seine zwei `any`-Casts los.

Nachgezogen: der Kopfkommentar von `src/dispatch-parity.spec.ts` behauptete »the chain is written out twice, once per path«, was seit diesem Paket falsch ist. Die Spec bleibt sinnvoll, verliert aber an Reichweite — eine Divergenz kann nur noch aus dem Ungeteilten kommen, etwa dem `'*'`-Wurf.

Finding-Volltext siehe Paket 1. Dieses Paket ist die Extraktion, mit der Paritäts-Spec aus Paket 1 und den Funktions-Formen aus Paket 3 als Netz.

- Ein Helfer in `src/utils.ts`, der ein Target, einen Event-Namen, die Argumente und den optionalen `returnValue`-Callback nimmt, über `dispatchableMember()` auflöst, sonst auf `.emit()` mit `prependEventName()` zurückfällt, und zurückgibt, ob überhaupt etwas gerufen wurde. Dieses Boolean ist lasttragend: `EventListener.apply()` entscheidet daran, ob ein `once()` verbraucht ist.
- Aufgerufen wird er vom `LISTENER_IS_OBJ`-Zweig in `EventListener.apply()` und von `_duckEmitOne()`.
- **Was nicht in den Helfer wandert:** der `'*'`-Wurf (steht in `_emitOne()` und `_duckEmitOne()` und muss dort bleiben, damit die dokumentierte Teil-Dispatch-Asymmetrie bei einem Namens-Array unverändert bleibt), die `isObjListener()`-Prüfung und der `isCatchEmAll || eventName`-Test in `apply()`, sowie das Lesen des Watermark vor dem Dispatch.
- **Der heiße Pfad ist die Einschränkung.** Der Doc-Kommentar an `EventStore.forEach()` erklärt, dass die Größe dieser Funktion darüber entscheidet, ob ihr Aufrufer sie inlinet, und `mergeWalk()` liegt aus genau diesem Grund auf Modulebene. `apply()` steht unter demselben Druck. Der Helfer soll deshalb eine flache Modulfunktion sein, kein Closure-Fabrik und kein Objekt mit Optionen. Kommt der Subagent zu dem Ergebnis, dass die Extraktion `apply()` messbar verändert oder eine Prüfung duplizieren müsste, um zu passen, ist das ein Grund, das Paket blockiert zu melden statt es zu erzwingen: die Paritäts-Spec aus Paket 1 ist dann der bleibende Nutzen.
- Rein interner Refactor, also laut AGENTS.md keine Doku-Pflicht. Kein CHANGELOG-Eintrag.

---

### [x] 7. internalsOf() einmal pro emit(), nicht pro Event-Namen

- Findings: PERF-001
- Ziel: Ein `emit()` mit Namens-Array liest den Marker einmal statt einmal pro Namen.
- Dateien: `src/eventize-api.ts`, `src/emit.spec.ts`, `src/marker-integrity.spec.ts`
- Modell: mittlere Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 983 Tests (+6)
- Commit: `perf(emit): resolve the internals once per emit() instead of once per event name`
- Hash: `efe16fc`

Ergebnis: eine Runde. Gemessen: `emit(ε, ['a','b','c'])` liest den Marker jetzt 2 statt 4 Mal, konstant statt N+1.

**Die wörtliche Empfehlung dieses Plans war falsch, und der Implementierer hat das begründet verworfen.** »store und keeper einmal in `_emit()` auflösen« hätte den Protokoll-Check vor den `'*'`-Wurf gezogen und ihn auch für ein leeres Namens-Array laufen lassen. Der Reviewer hat die wörtliche Variante probeweise gebaut und beide Regressionen bestätigt. Umgesetzt ist stattdessen ein Akkumulator: `_emitOne()` nimmt die aufgelösten Internals entgegen und gibt sie zurück, der Array-Zweig fädelt sie durch. Beide Reihenfolgen sind jetzt gepinnt.

**Ein Regressionsfund, der wie eine Geschmacksfrage aussah.** Die erste Fassung ersetzte `.forEach()` durch `for...of`. Für ein dichtes Array gleichwertig, für ein lückenhaftes nicht: `.forEach()` überspringt Lücken, `for...of` liest sie als `undefined` und dispatcht **und retaint** einen Event dieses Namens. Das tat weder dieser Pfad vorher noch tut es der Duck-Pfad, der weiter `.forEach()` benutzt — also eine neue Divergenz genau in der Regel, die AGENTS.md unter »The two dispatch paths in `emit` move in lockstep« führt, nur eine Ebene über dem, wo die Paritäts-Spec aus Paket 1 hinreicht. Behoben durch Rückkehr zu `.forEach()` mit dem Akkumulator in einer äußeren Variablen, gepinnt mit drei Fällen über beide Pfade. Der Reviewer hat zusätzlich das Array mit führender und mit abschließender Lücke geprüft und dass keine Lücke die Retain-Seite erreicht.

Der Kommentar an der Schleife benennt die Schleifenform jetzt ausdrücklich als Lockstep-Frage und nicht als Stilfrage, damit sie niemand beim nächsten Aufräumen zurückdreht.

**PERF-001 · low · src/eventize-api.ts:151 innerhalb von _emitOne, Aufrufschleife in :162-168** — emit(ε, [a,b,c]) liest den Marker pro Event-Namen neu

`internalsOf()` steht laut eigenem Doc-Kommentar bewusst außer der Reihe, weil es auf jedem Dispatch-Pfad sitzt und der Erfolgsfall »one property load and one compare« kosten muss. `_emitOne()` ruft es selbst auf, und `_emit()` ruft `_emitOne()` pro Namen. Ein `emit(ε, ['a','b','c'])` zahlt damit dreimal Symbol-Property-Load, Protokoll-Vergleich und Objekt-Destrukturierung für denselben Emitter.

Empfehlung: `store` und `keeper` einmal in `_emit()` auflösen und an `_emitOne()` übergeben. Der `'*'`-Wurf bleibt in `_emitOne()`, damit die dokumentierte Teil-Dispatch-Asymmetrie unverändert bleibt.

Zusätzlich zu beachten:

- Die Reihenfolge »erst `'*'` prüfen, dann die Internals lesen« im Einzel-Namen-Fall darf sich nicht so verschieben, dass `emit(ε, '*')` künftig einen Protokollfehler statt der Wildcard-Meldung wirft. Ein Spec-Fall in `marker-integrity.spec.ts` oder `wildcard-emit.spec.ts` hält die Reihenfolge fest, falls noch keiner existiert.
- Der Protokoll-Check ist eine Sicherheitsgrenze, nicht nur ein Cache: er muss weiter bei **jedem** `emit()` laufen, auch bei einem mit leerem Namens-Array. Prüfen, was `emit(ε, [])` heute tut, und dass es sich nicht ändert.

---

### [x] 8. Subscribe-Pfad: Replay-Queue und Registrar-Closures

- Findings: PERF-002, plus der Sparse-Array-Guard aus dem Review (siehe Entscheidungen)
- Ziel: Ein `on()` ohne retainte Werte allokiert kein Replay-Array und kein Curry-Paar.
- Dateien: `src/subscribeTo.ts`, `src/on.spec.ts`, `src/onceAsync.spec.ts`, `CHANGELOG.md`, `README.md`, `docs/migration.md`, `docs/lifecycle.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/{api-details,migration}.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 991 Tests (+8)
- Commit: `perf(subscribe): drop the eager replay array and the curried registrar`
- Hash: `0edae59`

Ergebnis: zwei Runden. Gemessen und vom Reviewer unabhängig reproduziert: Namens-Array-Form rund 5 bis 8 Prozent billiger, Einzelnamen-Form 2 bis 4 Prozent und näher am Rauschen. `publish()` wird bei nichts Retaintem null-mal statt 27-mal gerufen; die 32 nicht-leeren Batches sind Byte für Byte gleich. Ein Vergleich zweier Bundles über 111 Szenarien ergab null Unterschiede — mit einer Ausnahme, die in dieser Matrix fehlte.

**Der zweite Loch-Fund dieses Laufs, spiegelbildlich zu Paket 7.** Dort lieferte `for...of` Löcher als `undefined`, hier überspringt `map()` sie.

Zur Historie, korrigiert nach dem Abschluss-Review und selbst an `155e51e` nachgeprüft: **`v5.1.0` warf hier nichts.** Sein Array-Zweig war ein einziger `eventName.map()`, und `map` ruft für ein Loch nicht zurück, registrierte also `'a'` und `'b'` und schwieg. Der rohe `TypeError: Cannot read properties of undefined (reading '1')` kam aus einem v6-Zwischenstand, in dem die Prioritätsprüfung als eigener `for...of`-Durchlauf über die aufgelösten Tupel hinzukam. Wer die zwei verwechselt, ordnet `sparse-names` als Fix statt als Breaking Change ein — was in beiden Migrationsdateien tatsächlich passiert ist.

Die erste Fassung dieses Pakets stellte also unabsichtlich das `v5.1.0`-Verhalten wieder her: stillschweigend die belegten Slots registrieren, und `once(ε, new Array(2), h)` gab ein Handle auf nichts zurück, `onceAsync(ε, new Array(2))` ein Promise ohne Settle. Auf Nutzerentscheidung wird ein lückenhaftes Array jetzt sauber abgewiesen, mit eigener `cause` (`sparse-names`), atomar und vor jeder Auflösung. Ein explizit gesetztes `undefined` bleibt unberührt, es ist ein Wert und kein Loch.

Zwei Dinge, die der Reviewer zusätzlich gemessen hat: bei Loch **und** `NaN`-Tupel gewinnt in beiden Reihenfolgen `sparse-names`, beide Wege atomar. Und die dokumentierte Randkombination hält: ein bereits abgebrochenes Signal plus lückenhaftes Array rejectet mit der Abbruch-Reason statt zu werfen, weil der Abort-Vorabtest bewusst vor der Validierung steht (siehe Paket 4).

Der Migrationshinweis im CHANGELOG empfahl zunächst `names.some((_, i) => !(i in names))` als Lückenprüfung — was nicht funktioniert, weil `some()` Löcher genauso überspringt wie `map()`. Selbst gegengeprüft: `false` statt `true`. Ersetzt durch eine indizierte Schleife.

**Offen für den Abschluss dieses Laufs, nicht für dieses Paket:** `docs/migration.md` und `skills/using-eventize/references/migration.md` führen in ihrer Einleitung noch »Fourteen breaking changes … eight runtime«. Der Reviewer hat im CHANGELOG nachgezählt: es sind zehn Runtime und sechs Typ-only, zusammen sechzehn, und der CHANGELOG-Vorspann sagt das auch. Die Drift stammt aus den Paketen 2 bis 8, die den Zähler jeweils nur im CHANGELOG mitgezogen haben.

**PERF-002 · low · src/subscribeTo.ts:254 (retainedEvents), :199-209 (register), :237-243 (entries)** — Der Subscribe-Pfad allokiert Replay-Array und Curry-Closures für eine fast immer leere Queue

Jedes `on()` und jedes `once()` allokiert unbedingt ein `retainedEvents`-Array, das für jeden Emitter ohne `retain()` leer bleibt und von `EventKeeper.publish()` sofort wieder verworfen wird. Dazu kommt `register` als Curry-Paar, also zwei Closures pro Aufruf statt einer Funktion mit Argumenten. Die Array-Form legt zusätzlich ein `entries`-Array plus ein Tupel pro Namen an und läuft die Namen dreimal durch: `map`, Assertion-Schleife, `map`. Dieselbe Prämisse, auf der `EventKeeper` seine geteilten Stand-ins und `registerEventListener()` seinen `hasRetainedFor()`-Gate baut (die meisten Emitter sehen `retain()` nie), gilt hier nicht.

Empfehlung: `retainedEvents` lazy anlegen, etwa als Rückgabewert von `registerEventListener()` oder über einen Holder, der erst beim ersten Replay ein Array bekommt. `register` durch eine Funktion mit `(prio, event)` ersetzen, so wie `applyListener()` auf dem Emit-Pfad. Die Array-Form auf einen Durchlauf ziehen, der Priorität auflöst und prüft.

Zusätzlich zu beachten:

- **Die Atomizität der Prüfungen bleibt.** Ein `NaN` in einem Tupel muss weiter die ganze Registrierung abweisen, bevor der erste Name abonniert ist. Wer die drei Durchläufe auf einen zieht, darf nicht dabei anfangen zu registrieren, während später noch geprüft wird. Der Kommentar an dieser Stelle nennt genau das als Grund für die Trennung; wenn ein Durchlauf nicht geht, ohne die Atomizität zu verlieren, bleiben es zwei.
- Reihenfolge der Replays: `EventKeeper.publish()` sortiert nach `order`, und ASYNC-004 (außerhalb des Scopes) beschreibt, dass die Array-Form dadurch anders replayt als zwei getrennte Aufrufe. Dieses Paket darf daran nichts ändern; die Fälle in `retain.spec.ts:158-189` pinnen die Reihenfolge.
- Läuft nach Paket 5, das dieselbe Datei und dieselbe Queue berührt. Erst dessen Commit, dann dieses.
- Rein interne Optimierung, kein CHANGELOG-Eintrag.

---

### [x] 9. Fehlermeldungen von retainClear() und unretain()

- Findings: API-003
- Ziel: Die zwei Meldungen nennen Ursache und Abhilfe und tragen dieselbe Fehlerklasse wie der Rest der Bibliothek.
- Dateien: `src/eventize-api.ts`, `src/emit-ducktyping.spec.ts`, `src/retainClear.spec.ts`, `src/unretain.spec.ts`, `README.md`, `docs/retain.md`, `docs/migration.md`, `CHANGELOG.md`, `skills/using-eventize/SKILL.md`, `skills/using-eventize/references/migration.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 991 Tests (unverändert, vier bestehende Fälle nachgezogen)
- Commit: `fix(api): retainClear() and unretain() throw a TypeError that names the remedy`
- Hash: `aba33f6`

Ergebnis: eine Runde. Zwölf Vorkommen des alten Wortlauts gefunden, neun nachgezogen, drei als historische v4→v5-Zitate über `emit()`/`emitAsync()` stehen gelassen — einzeln nachgeprüft und bestätigt. Selbst gegen das gebaute Bundle verifiziert: beide werfen echte `TypeError`-Instanzen, nicht bloß mit geändertem Wortlaut.

Die Runde war nötig, weil `skills/using-eventize/references/migration.md` den Breaking Change zunächst nicht trug, obwohl `SKILL.md` genau auf diese Datei als Detailquelle verweist. AGENTS.md verlangt beides, die Zusammenfassung im Skill und das Detail in der Referenz.

**API-003 · info · src/eventize-api.ts:1074, src/eventize-api.ts:1098** — Zwei Fehlermeldungen bleiben unter dem Niveau des Rests

`retainClear()` und `unretain()` werfen `new Error('object is not eventized')`. Jede andere Fehlerstelle der Bibliothek nennt Ursache und Abhilfe und wählt die passende Klasse: `asEventized()` und `internalsOf()` werfen `TypeError` mit Diagnose, `retain()` und `emit()` werfen `Error` mit einem Satz, der die Regel erklärt. Diese zwei nennen weder das Paket noch was zu tun ist. Die Meldung selbst ist in `README.md:249` und `docs/retain.md:265` als Wortlaut dokumentiert, eine Änderung berührt also die Doku mit.

Empfehlung: Auf `TypeError` mit einem Satz umstellen, der die Abhilfe nennt (`eventize(obj)` oder ein `isEventized()`-Guard davor), und die Doku-Stellen mitziehen.

Zusätzlich zu beachten:

- **Der Wortlaut ist an mindestens drei Stellen gepinnt**, unter anderem `emit-ducktyping.spec.ts:287-293`. Vor der Änderung alle Vorkommen von `object is not eventized` über `src/`, `docs/`, `README.md` und `skills/` suchen und jede einzeln nachziehen. Ein `grep` ist Teil des Auftrags, nicht Kür.
- Die Klassenänderung von `Error` auf `TypeError` ist ein Breaking Change für Code, der auf die Klasse oder den Wortlaut testet. Gehört als solcher ins `CHANGELOG.md` und, weil es gegen `v5.1.0` bricht, mit Grep-Muster in `docs/migration.md`.
- `skills/using-eventize/SKILL.md:86` führt die Tabelle »was passiert bei nicht-eventisierten Objekten« und nennt die Meldung. Mitziehen, und der Skill bleibt selbsttragend.

---

### [x] 10. Geerbter Marker-Slot: Verhalten dokumentieren und pinnen

- Findings: COR-004
- Ziel: Dass ein eventisierter Prototyp seinen Emitter mit allen Instanzen teilt, steht dokumentiert und ist von einer Spec gehalten.
- Dateien: `src/isEventized.ts`, `src/marker-integrity.spec.ts`, `README.md`, `skills/using-eventize/references/api-details.md`, `AGENTS.md`, `CHANGELOG.md`
- Modell: mittlere Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 996 Tests (+5)
- Commit: `docs(marker): state that an inherited marker slot shares one emitter`
- Hash: `349ec26`

Ergebnis: eine Runde, keine Befunde im Review. Kein Code angefasst, nur der Doc-Kommentar an `isEventized()` gewachsen; `asEventized.ts` erscheint nicht einmal im Diff.

Gemessen und gepinnt, jede Aussage vom Reviewer unabhängig nachvollzogen: Instanz und Prototyp antworten gleich auf `isEventized()` und `getEventizeProtocol()`; `on()` durch eine Instanz und `emit()` durch eine andere erreichen denselben Listener; `getSubscriptionCount()` meldet für alle denselben Wert; `off()` auf einer Instanz senkt ihn für alle; und `eventize(instanz)` legt keinen eigenen Slot an, wenn der Prototyp schon einen trägt.

Zwei Fragen, die der Plan nicht stellte und der Reviewer zusätzlich beantwortet hat: der **Keeper** wird ebenfalls geteilt, ein retainter Wert wird also instanzübergreifend nachgeliefert. Und wurde eine Instanz **vor** dem Prototyp eventisiert, gewinnt ihr eigener Slot, die zwei Emitter bleiben getrennt.

`AGENTS.md` hat einen Bullet unter »Known asymmetries« bekommen, weil genau das der Zweck der Liste ist: Verhalten, das wie ein Defekt aussieht und sonst beim nächsten Lauf reflexhaft repariert würde.

**COR-004 · info · src/isEventized.ts:17-20, src/asEventized.ts:10-21** — Ein geerbter Marker-Slot teilt einen Emitter über alle Instanzen

`isEventized()` liest `obj[NAMESPACE]` und folgt dabei der Prototypenkette. Ist ein Prototyp eventisiert, meldet jede Instanz `true`, `asEventized()` gibt sie unverändert zurück, und alle Instanzen teilen einen Store und einen Keeper. Ein `emit()` auf einer Instanz erreicht die Listener aller anderen. Erreichbar über `eventize(SomeClass.prototype)` oder über ein eventisiertes Objekt als Prototyp.

Entscheidung für dieses Paket (siehe Abschnitt Entscheidungen): das Verhalten bleibt und wird dokumentiert.

- **Kein Eingriff in `isEventized()` oder `asEventized()`.** Der Guard folgt der Prototypenkette weiter.
- Doc-Kommentar an `isEventized()`: der Slot wird geerbt, deshalb ist ein eventisierter Prototyp ein geteilter Emitter, und das ist die Konsequenz aus »der Marker ist eine Property, nicht ein Eintrag in einer Registry«. Ein Satz dazu, dass das nutzbar ist (ein Emitter für eine ganze Klasse) und wann es überrascht.
- Spec in `marker-integrity.spec.ts`: ein eventisierter Prototyp, zwei Instanzen, `on()` auf der einen, `emit()` auf der anderen, der Listener feuert. Dazu, dass `getSubscriptionCount()` für beide Instanzen denselben Wert meldet.
- `README.md` und `skills/using-eventize/references/api-details.md` (dort der `isEventized()`-Abschnitt ab Zeile 198) bekommen je einen Satz. Der Skill bleibt selbsttragend.
- Kein Verhaltenswechsel, also kein CHANGELOG-Eintrag unter »Fixed« oder »Breaking«; eine Zeile unter der Doku-Rubrik, falls es eine gibt.

---

### [x] 11. on() und once() aus einer Overload-Quelle

- Findings: API-001
- Ziel: Der Overload-Satz von `on()` und `once()` steht einmal, nicht zweimal handgepflegt.
- Dateien: `src/types.ts`, `src/eventize-api.ts`, `CHANGELOG.md` — **keine Spec angefasst**
- Modell: stärkste Stufe
- Verify: `npm run cbt` — Exit 0, 34 Suiten, 996 Tests (unverändert)
- Commit: `refactor(types): declare on() and once() from one shared overload interface`
- Hash: `65b4dda`

Ergebnis: eine Runde. `src/eventize-api.ts` 1163 → 697 Zeilen, `src/types.ts` 623 → 879, netto −210 bei einer statt zwei Quellen.

Der Beweis, dass sich die Typ-Fläche nicht verschoben hat, steht auf drei Beinen: die 35 emittierten Signaturen sind byteweise identisch mit den früheren 35 von `on` **und** den 35 von `once`, in identischer Reihenfolge; eine 137-zeilige Typ-Probe des Reviewers liefert auf beiden Ständen exakt dieselben 26 Fehlerstellen mit denselben TS-Codes; und alle vierzig `@ts-expect-error`-Direktiven in den Typ-Specs bleiben nötig, sonst bräche `tsc` mit TS2578 ab. Kein Spec-File wurde angefasst.

**Aus zwei Casts wurden null.** Der Review fand, dass eine Annotation statt der Assertion dieselben Deklarationen erzeugt und dabei strenger prüft. Der Implementierer hat die Messung des Reviewers nicht übernommen, sondern nachgestellt und widerlegt (`any` ist in beide Richtungen zuweisbar, da findet auch die Annotation nichts) und die tragfähige Demonstration selbst gefunden: mit `void` als Implementierungs-Rückgabe meldet die Annotation `TS2322`, der Cast nichts. Selbst nachgeprüft, mit demselben Ergebnis. Damit ist zum ersten Mal maschinell abgesichert, dass Implementierung und Overload-Satz nicht auseinanderlaufen. Der Cast bei `SubscribeImpl` in `src/eventize.ts` bleibt, dort scheitert die Annotation tatsächlich.

Drei Unterschiede in `lib/index.d.ts`, alle benannt: der Overload-Satz wird zum Interface plus zwei `declare const`; ein JSDoc-Block, wo vorher keiner stand; `type StandaloneSubscribeFunc` in der Export-Liste. Der einzige Runtime-Unterschied: `on` und `once` haben `.prototype` und Konstruierbarkeit verloren, `off` und `emit` bleiben Function-Declarations. Steht als Halbsatz im CHANGELOG.

**Eine Annahme dieses Plans war falsch:** `npm run check:dts` wurde hier als harte Grenze ausgewiesen. `scripts/checkDeclarationSurface.cjs` matcht aber nur `/^declare class (\w+)/gm` und wäre genauso grün, wenn der komplette Overload-Satz verschwände. Die tragenden Netze waren `attw --pack` und die Typ-Specs.

Nicht gelöst und nicht lösbar: `SubscribeFunc` (Methodenflächen) und `StandaloneSubscribeFunc` (freistehend) spiegeln sich weiter von Hand, weil die eine über `NonTypedEmitter<T>` auf `obj` schließt und die andere über `LooseNames<TEvents>` auf dem Namens-Slot. TypeScript kann nicht über einen Satz Call-Signaturen mappen. Die Duplikation ist von 35+35+22 auf 35+22 gefallen, und die verbliebene steht als Nachbarschaft in einer Datei statt über 460 Zeilen in einer anderen.

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

## Abschluss

Abgeschlossen 2026-08-03. Elf von elf Paketen umgesetzt, keines blockiert, zwölf Commits auf `remediation/audit-2026-08-03` plus dieser Abschluss-Commit.

**Verify auf dem übergebenen Baum:** `npm run cbt` Exit 0 in allen sieben Stufen. 34 Suiten, 996 Tests gegen 905 in der Baseline, also 91 neue. Branch-Coverage 98,85 auf 98,87 Prozent. Keine Schwelle gesenkt, kein Spec entfernt.

**Semver.** `package.json` führt `6.0.0-dev`, und AGENTS.md verbietet ausdrücklich, den Suffix zu streichen oder die Version anzuheben: das Release ist eine menschliche Entscheidung. Die Version bleibt deshalb unverändert. Die Bewertung selbst fällt eindeutig aus: dieser Lauf enthält mehrere Änderungen, die für sich genommen major wären. `off(ε, obj, ctx)` entfernt weniger als vorher, `retainClear()` und `unretain()` werfen eine andere Fehlerklasse, ein lückenhaftes Namens-Array wirft, wo es still zwei von drei Namen registrierte, und `emit()` dispatcht auf Funktions-Targets, wo es schwieg. Alle davon werden vom unveröffentlichten `6.0.0` getragen und stehen unter dessen Überschrift im CHANGELOG; ein Consumer, der nie ein `6.x` hatte, trifft sie als Teil desselben Sprungs. Kein Bump nötig, kein Tag, kein Publish.

**Zähler-Abgleich.** Über die Pakete 2 bis 9 hinweg hatte jedes seinen eigenen Beitrag im CHANGELOG eingetragen, aber keines die Summen der zwei Migrationsdateien nachgerechnet. Der Abschluss zieht sie auf eine Zahl: siebzehn Breaking Changes, elf davon Runtime, sechs typ-only, in allen drei Dateien ausgeschrieben statt per Verweis, damit `skills/using-eventize/` selbsttragend bleibt. Dabei kamen zwei Fehleinordnungen ans Licht: `docs/migration.md` zählte zwei Änderungen mit, die das CHANGELOG zwei Zeilen weiter als »Not a breaking change« ausweist und begründet, und `sparse-names` stand in beiden Migrationsdateien unter »fixes«, obwohl es gegen `v5.1.0` ein echter Bruch ist. Beide sind korrigiert.

### Nebenbefunde für das nächste Audit

Aufgefallen während der Umsetzung, bewusst nicht Teil dieses Laufs:

- `on(ε, 'foo', 'toFixed', 42)` registriert und dispatcht auf `Number.prototype`, weil `canReadMembers()` jedes nicht-nullische Value durchlässt, und `off(ε, 42)` bekommt es nicht wieder los. Untypisiert erreichbar, deshalb kein Compile-Fehler.
- Die Lebenszyklus-Tabellen tragen die Funktions-Weitung nur in der `listenerFunc`-Zeile; die `listenerObject`-Zeile darunter nennt nicht, dass dieses Objekt eine Funktion oder Klasse sein darf.
- `CHANGELOG.md` sagt an einer Stelle »so nothing addressed one registration on its own«. Das Handle aus `on()` tat es immer; gemeint ist »keine identitätsbasierte `off()`-Schreibweise«.
- `isObjectListener` in `detachByIdentity()` ist statisch redundant, zur Laufzeit aber nicht: ein Primitive kann über die Methodennamen-Form in den Slot geraten, und der Vorfilter ist die Zeile, die »per Identität nicht entfernbar« wahr macht. Wer ihn als Aufräumkandidaten liest, bricht eine Zusicherung.
- `on(ε, 'evt', '__proto__', fn)` liest weiter roh, weil die Methodennamen-Form keinen Carve-out kennt. Konsistent mit der dokumentierten `toString`-Ausnahme, aber für die zwei unbedingten Carve-outs nirgends ausgesprochen.
- `skills/using-eventize/references/migration.md` und `docs/migration.md` sagen im v4→v5-Abschnitt »`retainClear()` and `unretain()` are unchanged and still throw«, ohne zeitliche Verankerung. Im historischen Kontext wahr, beim Durchscrollen ein scheinbarer Widerspruch zum v5→v6-Eintrag. Vorbestehend.
- `scripts/checkDeclarationSurface.cjs` matcht ausschließlich `/^declare class (\w+)/gm`. Es sieht keine `declare function` oder `declare const` an und wäre genauso grün, wenn ein kompletter Overload-Satz aus den Deklarationen verschwände.
