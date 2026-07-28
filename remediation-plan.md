# Remediation-Plan — @spearwolf/eventize

Quelle: ./audit.html vom 2026-07-27 · Branch: `main` · erstellt: 2026-07-28
Baseline: clean ✓ · build ✓ · typecheck ✓ · attw --pack 4/4 ✓ · test 682/682 in 29 Suiten, 99,82 % Statements ✓ · lint ✓ · format:check ✓ — vollständig grün, keine vorbestehenden Fehler
Scope: 4 von 24 Findings, vom Nutzer namentlich benannt (1 high, 2 medium, 1 low) · MEM-002 nur als Dokumentations-Notiz

## Scope

Umgesetzt werden **COR-001, DOC-002, PERF-002, PERF-001**.

Ausdrücklich **nicht** Teil dieses Laufs:

- **CI-004** — vom Nutzer als bewusste Entscheidung bestätigt: die Integrations-Harness bleibt manuell, kein Workflow.
- **MEM-002** — nach Rückfrage auf die Audit-Empfehlung reduziert: kein Codeeingriff, nur eine Zeile Dokumentation, die die Zurückstellung auf den nächsten Major festhält. Läuft in Paket 2 mit.
- **DEP-001/002/003** — im Audit als `acknowledged` geführt, Teil des angekündigten Build-System-Reboots.
- Die übrigen 19 Findings (TEST-001, CI-001/002/003, DX-002/003/004, API-002/003/004, TYPE-003/004, BUILD-003, DOC-001, REL-001, INFO-001/002/003) — vom Nutzer nicht benannt, bleiben für das nächste Audit stehen.

## Entscheidungen

- **COR-001: Keeper an den Store angleichen, nicht umgekehrt** (2026-07-28). `off(ε, ['a','b'], listenerObject)` wird ein vollständiger No-Op. Die Alternative — `EventStore.remove()` die Kombination behandeln lassen — würde eine undokumentierte Aufrufform zur dokumentierten machen.
- **COR-001: nur der Array-Zweig wird gekoppelt, der Namenszweig bleibt unangetastet** (2026-07-28). Die Audit-Empfehlung nennt „die Array- und die Namensverzweigung". Der Namenszweig trägt `off(ε, eventName, listenerObject)`, dessen Unretain des ganzen Namens in `docs/lifecycle.md:57` und in `AGENTS.md` als bewusst zurückgestellt festgeschrieben ist. Dort laufen Store und Keeper auch nicht auseinander — `forceRemove` greift, der Store entfernt die Subscription. COR-001 beschreibt und misst ausschließlich die Array-Form.
- **MEM-002: Audit-Empfehlung, kein Codeeingriff** (2026-07-28). `findSimilarListener()` bleibt wie sie ist; die Verhaltensasymmetrie des geteilten Referenzzählers geht auf die Liste des nächsten Majors. Kein CHANGELOG-Eintrag, da kein Verhalten sich ändert.
- **PERF-001: Clone-on-Mutate (`iterationDepth`), nicht der Mutationszähler** (2026-07-28). Das Audit bietet beide Varianten als gleichwertig an; sie sind es nicht. Der Snapshot in `forEach()` bestimmt nicht das Skip-Verhalten abgemeldeter Listener — `EventListener.apply()` bricht selbst bei `isRemoved` ab (`EventListener.ts:192`). Der Snapshot schützt gegen Index-Verschiebung **und** dagegen, dass ein mid-dispatch angemeldeter Listener im laufenden Emit noch drankommt. Eine im Moment der Mutation gezogene Kopie enthält den neu angemeldeten Listener und bricht damit `emit-reentrancy.spec.ts:86` („does NOT invoke a listener that was added mid-dispatch"). Nur Clone-on-Mutate hält die gepinnte Semantik.

## Vorbestehende Fehler

Keine. Die Baseline ist auf allen sieben `cbt`-Stufen grün.

## Verify

Pro Paket: `npm run cbt`. Das ist der Gate des Projekts (AGENTS.md) und der einzige Lauf, in dem die `coverageThreshold` lokal bindet. Kein `npx jest --clearCache` nötig — kein Paket rührt Dependencies, `tsconfig.json` oder eine `.d.ts`-Grenze an.

## Commits

4 Commits direkt auf `main`, ohne GPG-Signatur (`--no-gpg-sign`), Conventional Commits auf Englisch entsprechend `git log`.

---

## Pakete

### [x] 1. off(ε, [names], listenerObject): Keeper an den Store koppeln

- Findings: COR-001
- Ziel: Die einzige verbliebene Aufrufform, in der Store und Keeper auseinanderlaufen, wird zum vollständigen No-Op — sie meldet nichts ab und löscht folglich auch keinen Retain-Zustand mehr.
- Dateien: `src/eventize-api.ts`, `src/off.spec.ts`, `docs/lifecycle.md`, `CHANGELOG.md`, `AGENTS.md`
- Modell: mittlere Stufe · Reviewer: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `fix(off): stop off(ε, [names], listenerObject) from clearing retained state (COR-001)`
- Hash: `4fd78b0`
- Review: keine Befunde. Reviewer hat den roten Lauf per `git stash`-Roundtrip selbst reproduziert.
- Nebenbefunde: (a) `docs/`, `CHANGELOG.md` und `AGENTS.md` liegen außerhalb des `format:check`-Globs `src/**/*.{ts,js,json,md}` — vorbestehend, deckungsgleich mit DX-004, nicht Teil dieses Laufs. (b) `git log` datiert den ungeschützten Keeper-Array-Zweig auf den 4.0.0-Commit `5ef4a78`; der Fehler bestand also bereits in `v5.1.0` und wurde nicht von MEM-001 eingeführt — im CHANGELOG entsprechend eingeordnet.

**COR-001 · high · src/eventize-api.ts:565-580, src/EventStore.ts:210** — off(ε, [names], listenerObject) leert den Keeper, ohne einen einzigen Listener zu entfernen

Der Array-Zweig von `EventStore.remove()` verlangt `listenerObject == null`, sonst greift er nicht. Mit einem Listener-Objekt als drittem Argument fällt die Verarbeitung bis auf `removeByListener(array, obj)` durch, wo ein Array niemals mit einer Listener-Identität übereinstimmt: es wird nichts entfernt. Der Keeper-Zweig in `off()` prüft diese Bedingung jedoch nicht mit, sondern nur `Array.isArray(listener)`, und ruft `keeper.remove()` für alle Namen des Arrays auf. Gemessen an einem Emitter mit einer Subscription und zwei Retain-Policies: nach `off(ε, ['a','b'], lo)` steht der Store unverändert bei 1 Subscription, während der Keeper von 1 Wert und 2 Policies auf 0 und 0 fällt. Damit ist dies die einzige verbliebene Stelle, an der Store und Keeper nachweislich auseinanderlaufen: eine Aufrufform, die nichts abmeldet, löscht Retain-Zustand. Genau diese Fehlerklasse hat v6 an drei anderen Stellen als BREAKING geschlossen. Weder `docs/lifecycle.md:30`, das alle `off()`-Formen tabelliert, noch `off.spec.ts` oder `lifecycle.spec.ts` erfassen die Kombination aus Array und Listener-Objekt.

Empfehlung (mit der Präzisierung aus den Entscheidungen oben): Den Keeper-Zweig an dieselbe Bedingung koppeln, unter der der Store überhaupt tätig wird. Konkret genügt das für den Array-Zweig:

```diff
-  if (Array.isArray(listener)) {
+  if (listenerObject == null && Array.isArray(listener)) {
     keeper.remove(listener.filter(isEventName));
   } else if (isEventName(listener)) {
```

Der `else if (isEventName(listener))`-Zweig bleibt **unverändert**: er trägt `off(ε, eventName, listenerObject)`, dessen Unretain des ganzen Namens `docs/lifecycle.md:57` und `AGENTS.md` als bewusst zurückgestellt führen, und dort entfernt der Store per `forceRemove` sehr wohl eine Subscription.

Umsetzung, Reihenfolge zwingend:

1. **Zuerst der fehlschlagende Test.** In `src/off.spec.ts` ein Fall, der einen Emitter mit einer Subscription eines Listener-Objekts und zwei Retain-Policies aufbaut, `off(ε, ['a','b'], lo)` aufruft und prüft: `getSubscriptionCount(ε)` unverändert **und** `getRetainedCount(ε)` unverändert. Rot laufen sehen, im Report festhalten, was genau fehlschlug.
2. Dann die eine Bedingung ergänzen.
3. `docs/lifecycle.md`: eine Zeile in der Formen-Tabelle (ab Zeile 34) für `off(ε, [eventName, …], listenerObject)` — Store: nichts, Keeper: nichts, vollständiger No-Op. Sie gehört neben die Zeile 43/44-Gruppe, weil sie ein Listener-Objekt trägt. Dazu ein Satz im Fließtext darunter, der benennt, warum die Form nichts tut: der Store kennt sie nicht, und der Keeper folgt ihm jetzt darin.
4. `CHANGELOG.md`, Sektion `## \`v6.0.0\` (unreleased)`: Eintrag als Fix. Gegen `v5.1.0` formulieren, keine Zwischenversion nennen.
5. `AGENTS.md`, Abschnitt „Known asymmetries": die Form in den Absatz zu `off(ε, eventName, listenerObject)` einordnen — die Array-Variante mit Listener-Objekt ist der No-Op, die Einzelnamen-Variante die bewusst belassene Asymmetrie. Genau diese Nachbarschaft ist es, die sonst wieder verwechselt wird.

---

### [x] 2. Retain bei re-entrantem emit() festschreiben, MEM-002-Zurückstellung notieren

- Findings: DOC-002, MEM-002 (nur Dokumentation)
- Ziel: Das Verhalten, dass bei Selbstrekursion der äußerste `emit()`-Aufruf den Retain-Wert gewinnt, bekommt eine Spec und einen Absatz in der Doku — geändert wird nichts.
- Dateien: `src/emit-reentrancy.spec.ts`, `docs/retain.md`, `skills/using-eventize/references/api-details.md`, `AGENTS.md`
- Modell: mittlere Stufe · Reviewer: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `docs(retain): pin and document the retain order of a re-entrant emit (DOC-002, MEM-002)`
- Hash: `d3dee8e`
- Review: eine Runde. Befund `wichtig` — die Prosa verengte die Divergenz auf Selbstrekursion, obwohl **jedes** verschachtelte `emit()` sie auslöst; schlichtes Forwarding (`on(upstream, downstream)`) ist der praktisch häufigere Weg hinein. Nachgebessert in `docs/retain.md`, `api-details.md` und `SKILL.md`, dazu eine zweite Spec für den Forwarding-Fall (zwei verschiedene Eventnamen, Wildcard-Abonnent sieht `['b','a']`). Nachprüfung: Befund erledigt.
- Kleiner Befund, bewusst nicht nachgebessert: `skills/using-eventize/SKILL.md` schreibt „the inner call writes first, the outer call overwrites last" — „overwrites" trifft streng nur den Selbstrekursions-Fall (ein Slot); beim Forwarding sind es zwei Slots mit verschiedener Order-ID. Das Beispiel direkt darunter stellt es richtig, `docs/retain.md` und `api-details.md` halten die Unterscheidung sauber.
- Zwischenfall: Der Reviewer hat bei seiner Gegenprobe `src/emit-reentrancy.spec.ts` auf den HEAD-Stand statt auf den Diff-Stand zurückgesetzt und dabei beide neuen Specs gelöscht. Wiederhergestellt per `git apply --include=src/emit-reentrancy.spec.ts` aus der gesicherten Diff-Datei; der Arbeitsbaum wurde vor dem Commit byte-identisch gegen den reviewten Diff geprüft (685/685 statt der zwischenzeitlich gemessenen 683).

**DOC-002 · medium · src/eventize-api.ts:83-99, docs/retain.md:14** — Re-entrantes emit() hält den älteren Wert, ohne dass es irgendwo steht

`_emitOne()` schreibt `keeper.retain(eventName, args)` nach dem Dispatch. Emittiert ein Listener denselben Namen erneut, schließt der innere Aufruf zuerst ab und schreibt zuerst; der äußere überschreibt anschließend mit seinen älteren Argumenten und einer höheren Order-ID. Probe: bei `retain(ε,'ping')` und einem Listener, der bis zum Wert 2 hochzählt, sieht ein danach hinzukommender Abonnent den Wert 0, nicht 2. Die Reihenfolge, die `docs/retain.md:14` als „original emission order" zusagt, ist damit die Abschluss- und nicht die Startreihenfolge, und bei Selbstrekursion gewinnt der äußerste Aufruf. Das Verhalten folgt zwingend aus der dokumentierten Zusage, dass ein werfender Listener den zuvor gehaltenen Wert unangetastet lässt, denn dafür muss der Schreibvorgang hinten stehen. Beschrieben ist es nirgends und von keiner Spec berührt: `emit-reentrancy.spec.ts` deckt An- und Abmeldungen während des Dispatch ab, nicht das Retain-Verhalten.

Empfehlung: Zunächst festschreiben statt ändern: ein Fall in `src/emit-reentrancy.spec.ts` oder `src/retain.spec.ts`, der den gewinnenden Wert bei Selbstrekursion pinnt, dazu ein Absatz in `docs/retain.md`, der die Formulierung „emission order" zu Abschlussreihenfolge präzisiert. Eine Verhaltensänderung, also `retain` vor den Dispatch zu ziehen, wäre breaking und würde die Zusage zum werfenden Listener aufheben; sie gehört, wenn überhaupt, als bewusste Entscheidung mit CHANGELOG-Eintrag auf die Liste, nicht als stiller Fix.

Umsetzung:

1. Spec in `src/emit-reentrancy.spec.ts` (dort steht die Re-entrancy-Familie beisammen), eigener `describe`-Block für Retain: ein Listener, der bis 2 hochzählt und dabei denselben Namen re-emittiert; danach ein neuer Abonnent, der den Wert **0** sieht. Der Kommentar über dem Fall muss die Begründung tragen — Schreibvorgang steht nach dem Dispatch, damit ein werfender Listener den alten Wert nicht zerstört —, nicht bloß das Ergebnis wiederholen.
2. `docs/retain.md`: der Aufzählungspunkt Zeile 14 („in original emission order") wird zu Abschlussreihenfolge präzisiert, darunter ein kurzer Absatz mit dem Selbstrekursions-Fall und dem Grund. Der Zusammenhang mit dem werfenden Listener gehört dazu, sonst liest sich das Verhalten wie ein Versehen.
3. `skills/using-eventize/references/api-details.md`: die Retain-Semantik dort um denselben Punkt ergänzen, knapp — der Skill sagt die Fallstricke an, nicht die Signaturen.
4. **MEM-002**, `AGENTS.md`: Der Absatz zu MEM-002 unter „Known asymmetries" führt den geteilten Referenzzähler bereits als bekannt. Er bekommt einen Halbsatz, der die Zurückstellung explizit macht: die Behebung — `findSimilarListener()` die Deduplizierung auf einen Listener mit gesetztem `callAfterApply` verweigern — steht auf der Liste des nächsten Majors, nicht in v6.0.0, weil ihr Radius für Consumer unklar ist, die auf der bestehenden Zählweise aufbauen. **Kein Codeeingriff, kein CHANGELOG-Eintrag.**

Kein CHANGELOG-Eintrag für dieses Paket insgesamt: es ändert kein Verhalten.

---

### [x] 3. Wildcard-Replay über die gehaltenen Werte statt über die Policies

- Findings: PERF-002
- Ziel: Ein `on(ε, '*')` kostet nur noch so viel, wie tatsächlich Werte gehalten werden, nicht so viel, wie Retain-Policies existieren.
- Dateien: `src/EventKeeper.ts`, `src/retain.spec.ts` (oder die passende bestehende Keeper-Spec)
- Modell: mittlere Stufe · Reviewer: mittlere Stufe
- Verify: `npm run cbt`
- Commit: `perf(keeper): replay wildcard subscriptions over retained values, not policies (PERF-002)`
- Hash: `6622788`
- Review: keine Befunde. Map-Signatur korrekt aufgelöst (`(_event, name) =>`), Ergebnisgleichheit hält — einziger Schreibpfad in `events` ist `retain()`, gated auf `eventNames.has()`, und die Reihenfolge entsteht ohnehin erst über `order` in `publish()`, nicht über die Iterationsreihenfolge.
- Statt `retain.spec.ts` liegt die Spec in `src/EventKeeper.spec.ts` — dort steht die Keeper-Familie beisammen. Der Plan ließ beides offen.
- Nebenbefund, im Paket mitbehoben: Der bestehende Guard-Test `replayTo skips a wildcard name inside eventNames instead of recursing` seedete `eventNames`, das der neue Wildcard-Zweig nicht mehr liest. Er wäre grün geblieben, ohne noch etwas zu messen; die Branch-Coverage von `EventKeeper.ts` wäre still von 100 % auf 93,33 % gefallen, global auf 98,01 % bei einer Schwelle von 98. Umgezogen auf `keeper.events.set('*', …)`, gleiche Datei, vom Reviewer als wirksam bestätigt.
- CHANGELOG: die Sektion führte bereits eine `**Performance:**`-Rubrik, der Eintrag wurde dort ergänzt, nicht erfunden.

**PERF-002 · low · src/EventKeeper.ts:84-93** — Wildcard-Replay iteriert Retain-Policies statt tatsächlich gehaltener Werte

Der Catch-em-all-Zweig von `replayTo()` läuft über `this.eventNames`, also über die Menge aller Namen mit Retain-Policy, und ruft sich für jeden davon selbst auf, um dann über `this.events.get(name)` festzustellen, dass meist gar kein Wert vorliegt. Die Kosten eines Wildcard-Abonnements skalieren damit mit der Zahl der Policies statt mit der Zahl vorhandener Werte. Gemessen bei genau einem gehaltenen Wert: 10 Policies 66 µs, 1.000 Policies 99 µs, 20.000 Policies 1.409 µs für ein einzelnes `on(ε, '*')`. Bei dynamisch erzeugten Retain-Namen wächst die Policy-Menge unbegrenzt, während die Wertmenge klein bleiben kann.

Empfehlung: Über `this.events` iterieren statt über `this.eventNames`. Die Ergebnismenge ist identisch: jeder Eintrag in `events` besitzt per Konstruktion eine Policy, denn `retain()` schreibt nur bei vorhandener Policy, und `'*'` kann dort nie stehen, weil `retain('*')` wirft. Der Aufwand sinkt von O(Policies) auf O(Werte). Die Wildcard-Prüfung im Rumpf kann als Absicherung stehen bleiben; sie kostet nichts.

Umsetzung:

1. `this.eventNames.forEach` → `this.events.forEach`, wobei die `Map`-Callback-Signatur `(value, key)` ist: der Name ist das **zweite** Argument. Das ist die eine Stelle, an der diese Änderung stillschweigend falsch werden kann.
2. Der bestehende Kommentar über der Wildcard-Prüfung begründet sie mit „`'*'` can never be a retained name — `retain()` rejects it". Diese Begründung gilt für `events` genauso; der Kommentar ist anzupassen, nicht zu löschen, und soll benennen, warum `events` dieselbe Menge liefert wie `eventNames` — nämlich weil `retain()` nur bei vorhandener Policy schreibt.
3. Spec: ein Fall, der viele Policies gegen einen einzigen gehaltenen Wert stellt (`retain()` für N Namen, `emit()` nur für einen) und prüft, dass `on(ε, '*')` genau einmal replayt wird. Kein Benchmark in der Suite — gepinnt wird die Ergebnisgleichheit, nicht die Laufzeit.
4. Verhalten bleibt identisch, daher kein CHANGELOG-Eintrag als Fix; ein Perf-Eintrag unter `## \`v6.0.0\` (unreleased)` ist zulässig, wenn die Sektion eine Performance-Rubrik führt — nachsehen, nicht erfinden.

---

### [x] 4. emit(): Listener-Bucket nur noch bei tatsächlicher Mutation kopieren

- Findings: PERF-001
- Ziel: Der Normalfall eines Dispatch — kein Listener meldet sich während des Emits an oder ab — läuft ohne Allokation über den lebenden Bucket; nur eine Mutation während laufender Iteration erzwingt eine Kopie.
- Dateien: `src/EventStore.ts`, `src/EventStore.spec.ts`, `src/emit-reentrancy.spec.ts`, `AGENTS.md`
- Modell: stärkste Stufe · Reviewer: stärkste Stufe
- Verify: `npm run cbt`
- Commit: `perf(store): copy listener buckets only when a dispatch mutates them (PERF-001)`
- Hash: —
- **Erledigt in Runde 3, Feinschliff in Runde 4 und 5. Hash: `3215f22`.** Fünf Runden, vier Strukturversionen, je zwei Reviewer pro Runde.
- Runde 0 (`iterationDepth`-Zähler): vom adversarischen Review verworfen. Der Zähler beantwortete »läuft ein Walk?« statt »hält ein Walk *dieses* Array?« und klonte deshalb pro Mutation statt pro Bucket — 512 `once()`-Listener kosteten 512 Klone und 131.328 kopierte Slots gegen 1 Klon / 512 Slots vorher, Dispatch-Anteil +179 %.
- Runde 1 (monotone Walk-Id, Stempel auf selbst installierten Arrays): behebt das quadratische Klonen, Klone auf 1 pro Bucket und Walk. Mutationsfrei −3,5 % bis −20 % Wanduhr, null Allokation. Korrektheit gut belegt — 18.000 Differential-Fuzz-Seeds gegen HEAD plus 20.000 Seeds eines zweiten Reviewers gegen eine v5.1.0-Referenz, identische Traces, Negativkontrollen belegen die Empfindlichkeit des Harness.
- Zwei offene `wichtig`-Befunde aus Runde 1, beide dieselbe Ursache — der Stempel fragt »selbst installiert?«, entscheidend wäre »von einem Walk gehalten?«, und ein Walk hält höchstens zwei Arrays: **(1)** ein Dispatch, der k Buckets anfasst, zahlt k Klone statt 1; `off(ε, listenerObject)` über 64 Buckets 64 statt 1, Wanduhr 1,57× bis 1,76× langsamer. Das ist die in `docs/off.md` empfohlene Teardown-Form. **(2)** die Überlauf-`Map` allokiert und churnt auch bei null Klonen — 64 neue Eventnamen im Dispatch: 63 Sets, 1 Map, 63 Gets, 0 Klone, bis 1,62× langsamer.
- Randbedingungen für Runde 2, alle drei zusammen: mutationsfreier Dispatch nicht langsamer als HEAD; Klon-Zahl nirgends höher als HEAD; keine Allokation, wenn nicht geklont wird. Halten sie nicht gleichzeitig, ist **BLOCKIERT** der vorgesehene Ausgang — PERF-001 nicht umzusetzen ist legitim, es schlechter zu machen nicht.
- Dazu abzuarbeiten: ein `wichtig` (ein Kommentar in `src/emit-reentrancy.spec.ts:156-163` beschreibt den abgeschafften Mechanismus und ist inzwischen sachlich falsch) und sechs `klein` (falscher Zeugen-Verweis in `AGENTS.md`, vier CHANGELOG-Stellen mit gelöschten Funktionsnamen, fehlende Spec für die Ableitung des Klon-Ziels aus dem Array, toter `isEqual()`-Zweig als Folge des Umbaus).
- Runde 2 (frischer Implementierer, gehaltene statt installierter Buckets): Der Stempel ist ersatzlos weg. `forEach()` meldet die ein bis zwei Arrays an, die es abläuft, und gibt sie im `finally` zurück; `bucketForMutation()` klont, wenn `isHeld()` das Array in der Kette findet. Alle drei Randbedingungen halten: mutationsfrei 0,87 / 0,95 / 0,97 / 0,97 von HEAD (mit Wildcard 0,81 / 0,90 / 0,95 / 0,96), Kopienzahl nirgends höher, keine `Map` mehr. GC-Scavenges bei 512 Listenern / 500k Emits 2210 → 88. Verify 710/710, `EventStore.ts` 100 % in allen vier Spalten, global Statements 100 %, Branches 98,75.
- Korrektheit in Runde 2 sehr breit abgesichert: 32.000 Differential-Seeds bis Verschachtelungstiefe 20, 6.000 mit Symbol-Eventnamen, 14.336 erschöpfend enumerierte Programme, ein Weißkasten-Orakel gegen Schnappschüsse jedes gehaltenen Arrays, sechs von sieben anschlagenden Negativkontrollen; dazu 36.000 Seeds des zweiten Reviewers. Null Divergenzen. Die Paritätsregel »named gerade, wildcard ungerade« ist strukturell abgesichert — Named-Buckets sind ausschließlich Map-Werte, der Wildcard-Bucket ausschließlich ein Feld, jedes Array wird an seiner Zuweisungsstelle frisch alloziert, also können die Mengen nicht aliasen.
- Ein `wichtig` blieb: `isHeld()` läuft bei der Mutation eines **ungehaltenen** Buckets die Kette voll durch — genau im beworbenen Fall. Ein d-tief verschachtelter, auf jeder Ebene mutierender Dispatch kostet O(d²) Vergleiche: 1,16× bei Tiefe 2, 1,53× bei Tiefe 256, bei identischer Kopienzahl. Mit einer O(1)-Attrappe fällt Tiefe 256 auf 1,08× — der Kettendurchlauf ist die Ursache. `AGENTS.md` hält fest, dass es keinen Rekursionswächter gibt, die Tiefe also der Aufrufer bestimmt.
- **Entscheidung des Nutzers (2026-07-28): Runde 3 auf den O(d)-Scan.** Vorgelegt waren drei Wege — committen und die Tiefenabhängigkeit ehrlich dokumentieren, Runde 3, oder Paket 4 blockieren. Randbedingung 4 kommt hinzu: der Tiefenterm muss verschwinden, ohne dass eine der ersten drei kippt.
- Runde 3 (Zähler am Array): `isHeld()` ist ersatzlos gestrichen. `ListenerBucket` ist `Array<EventListener>` plus einen Zähler unter einem Symbol-Key; `forEach()` zählt sich in die ein bis zwei Buckets hinein, die es abläuft, und im `finally` wieder heraus, `bucketForMutation()` liest ein Feld. Der Store hat damit **keinen** Walk-Zustand mehr. Alle vier Randbedingungen halten. Jedes Array, das je Bucket wird, entsteht in `createBucket()` — auch der Klon, weil `slice(0)` benannte Properties nicht überträgt; drei Specs pinnen die vier Geburtsorte einzeln, weil ein fehlender Zähler sich nach einer überflüssigen Kopie selbst heilt und sonst unsichtbar bliebe.
- Runde 4 und 5: Dokumentationswahrheit und ein fehlender Pin. Der Trunkierungs-Guard in `removeByEventName()` war von keiner Spec gehalten — neutralisiert blieben alle 713 Specs grün, während `emit()` in einem Merge-Dispatch eine interne `Error` an den Aufrufer warf. Dazu der Symbol-Key (neutral gemessen, Mittel 1,002) und ein Dutzend Stellen in `AGENTS.md`, `CHANGELOG.md` und den Kommentaren, die den jeweils abgeschafften Mechanismus beschrieben oder Zeugen-Tests nannten, die nichts bezeugen.
- **Endstand.** Mutationsfreier Dispatch 0,79 bis 0,97 von HEAD (flach wie im Merge-Zweig) und ohne jede Allokation; GC-Scavenges bei 512 Listenern über 500k Emits 2052 → 71. Kopienzahl nirgends höher als vorher. Der mutierende Pfad kostet bis zu +16 % über einem kleinen Bucket, ohne Trend über die Verschachtelungstiefe — beides im CHANGELOG als Deckel benannt, ohne Punktzahlen, weil einzelne Zellen zwischen Läufen um zehn Punkte wandern. 714 Tests, `EventStore.ts` 100 % in allen vier Coverage-Spalten, global Statements 100 %.
- Belege über alle Runden: rund 110.000 Differential-Programme gegen den alten Stand, 32.768 erschöpfend enumerierte, ein Weißkasten-Orakel mit einer unabhängig geführten Grundwahrheit neben dem Zähler, zehn Negativkontrollen — davon drei, die nur das Orakel sieht. Null Divergenzen, null Mutationen an einem gehaltenen Array.
- Zwei Messfallen, für den Nächsten: zwei Bibliotheksvarianten im selben Prozess machen die Aufrufstelle polymorph und verschieben das Ergebnis zweistellig; `mergeWalk()` liegt an der Inlining-Grenze und will einen eigenen Prozess. Einen Reviewer hat außerdem ein übriggebliebener Rechenprozess von 0,97 auf 1,14 verschoben — auf 24 Kernen.

**PERF-001 · medium · src/EventStore.ts:337-394** — Jedes emit() kopiert den vollständigen Listener-Bucket, auch ohne Mutation

`forEach()` schützt den Walk gegen Ab- und Anmeldungen aus dem Listener heraus, indem es den Bucket per `slice(0)` kopiert. Der Schutz ist notwendig, die Kosten fallen aber bei jedem Dispatch an, obwohl die überwiegende Mehrheit der Emits nichts mutiert. Gemessen über je 20.000 Emits: 1 Listener 112 ns, 8 Listener 97 ns, 64 Listener 574 ns, 512 Listener 4312 ns pro Emit, insgesamt gut 10 Millionen kopierte Slots im größten Fall. Liegt zusätzlich ein Wildcard-Listener vor, werden zwei Arrays kopiert und der Merge kostet noch einmal rund ein Drittel mehr (512 Listener: 5718 ns). Positiv abgegrenzt: der Fall ohne Listener ist bereits optimiert und kostet 32,5 ns ohne jede Allokation. Für eine Bibliothek, die synchronen Dispatch in Game-Loops als Kernversprechen führt, ist dieser Allokationsdruck der wesentliche verbliebene Posten unter der Überschrift Ressourcenverschwendung.

Empfehlung, in der in den Entscheidungen festgelegten Variante: **Clone-on-Mutate über einen `iterationDepth`-Zähler.** `forEach()` erhöht ihn vor dem Walk und senkt ihn in einem `finally` wieder — ein werfender Listener darf ihn nicht erhöht zurücklassen, `src/emit-throwing-listener.spec.ts` ist der Zeuge dafür. Die Mutationspfade (`add`, `removeItemFromArray`, `removeListenerFromArray`, `removeAll` und was sonst einen Bucket in-place verändert) prüfen den Zähler: ist eine Iteration aktiv, wird der Bucket geklont, der Klon verändert und an die Stelle des alten gesetzt (`namedListeners.set(name, klon)` bzw. das Feld für die Wildcard-Liste), während der laufende Walk seine alte Array-Referenz behält. Ohne aktive Iteration bleibt alles in-place. Damit ist der Normalfall allokationsfrei und die gepinnte Semantik unverändert.

Konkrete Fallstricke, alle vor dem ersten Commit zu prüfen:

- **`catchEmAllListeners` ist heute `readonly`.** Ein Austausch der Referenz verlangt, das Feld schreibbar zu machen. Es darf dabei nicht öffentlich mutierbar werden — `EventizedObject` legt den Store offen, und `AGENTS.md` verlangt, dass nichts Internes auf die publizierte Oberfläche gerät. `grep -c '^declare class' lib/index.d.ts` muss bei 1 bleiben.
- **`getListenersForEventName()` legt Buckets lazy an** und speichert sie in der Map. Wer eine Referenz aus dieser Methode über eine Mutation hinweg hält, hält womöglich den alten Klon. Alle Aufrufer daraufhin durchsehen.
- **Verschachtelte Emits.** Ein Listener, der `emit()` erneut aufruft, hebt den Zähler auf 2. Das `finally` muss dekrementieren, nicht auf 0 setzen.
- **Der Merge-Zweig** (Named + Wildcard) hält zwei Referenzen und läuft mit `iLen`/`jLen`, die vor der Schleife gelesen werden. Da die Referenzen nach einem Klon auf die alten Arrays zeigen, bleiben die Längen gültig — das ist der Punkt, an dem die Variante trägt, und der Kommentar dort sollte es sagen.
- **Der Hole-Guard** (`throw new Error('EventStore: forEach encountered a hole')`) bleibt unverändert bestehen.

`src/emit-reentrancy.spec.ts` deckt die Fälle ab, die dabei nicht brechen dürfen (Peer mid-emit abgemeldet, `off(ε)` mid-emit, Selbstabmeldung, Anmeldung während des Dispatch) und ist der Regressionsschutz für den Umbau. Zusätzlich zu schreiben: ein Fall in `src/EventStore.spec.ts`, der die Allokationsfreiheit des Normalfalls prüft — die Bucket-Identität vor und nach einem mutationsfreien Emit ist dieselbe Array-Instanz, nach einem Emit mit Mutation eine andere. Das ist die einzige Spec, die die eigentliche Änderung überhaupt sichtbar macht.

`AGENTS.md`, Abschnitt „Architecture invariants": das `iterationDepth`-Protokoll aufnehmen. Wer künftig einen Mutationspfad ergänzt, muss wissen, dass er den Zähler zu prüfen hat — ohne diesen Satz ist die nächste in-place-Mutation eine Frage der Zeit.

Kein CHANGELOG-Eintrag als Verhaltensänderung; ein Performance-Eintrag unter `## \`v6.0.0\` (unreleased)` ist angebracht, mit den gemessenen Zahlen aus dem Audit.
