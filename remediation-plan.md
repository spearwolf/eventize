# Remediation-Plan — @spearwolf/eventize

Quelle: Scan der öffentlichen Oberfläche vom 2026-07-27, im Anschluss an den API-001/TYPE-003-Lauf · Branch: `main` · erstellt: 2026-07-27
Baseline: clean ✓ · build ✓ · typecheck ✓ · attw 4/4 ✓ · test 29 Suiten / 678 Fälle ✓ · Coverage 99.82 / 98.01 / 99.23 / 100 ✓ · lint ✓ · format ✓
Gemessen mit `npx jest --clearCache && npm run cbt` auf `47fb065`, Exit 0, Arbeitsbaum sauber.
Scope: 4 Pakete aus dem Oberflächen-Scan. Keines stammt aus `audit.html` — das sind Nebenbefunde des Vorlaufs, vom Nutzer ausdrücklich bestellt.

Der Vorgängerplan (API-001, TYPE-003, beide erledigt, Stand v6.3.0) liegt in `git show 47fb065:remediation-plan.md`.

## Entscheidungen

- **`SubscribeArgs` bleibt exportiert** (2026-07-27, Nutzer). Wrapper um `on()` / `once()` zu bauen ist ein gültiger Konsumentenfall, und dafür ist der Typ nötig.
- **`NonTypedEmitter` bleibt ebenfalls** (2026-07-27). Mein Scan hatte ihn als reine Overload-Mechanik geführt; das war falsch. `references/migration.md:135,160` erklärt ihn, und er steht namentlich in Fehlermeldungen, die Konsumenten lesen.
- **`EventizerFunc`, `EventizerFuncAPI`, `EventizeGuard` bleiben** (2026-07-27). Undokumentiert, aber sie beschreiben die Struktur von `eventize` selbst — wer die Funktion weiterreicht, braucht sie. Einen Export zu streichen, für den ein plausibler Grund existiert, ist kein Gewinn.
- **Paket 3 ist eingeplant, obwohl es ein Typbruch ist** (2026-07-27). Im Konzept stand „nur, wenn das Fenster ohnehin offen bleibt". Der Nutzer hat diesen Lauf angestoßen, ohne dass ein 6.x veröffentlicht wurde — das Fenster ist offen.
- **Semver-Fenster.** `npm view @spearwolf/eventize dist-tags` lieferte im Vorlauf `latest: 5.1.0`. Vor dem Abschluss erneut prüfen. Steht dort ein 6.x, wird aus Paket 3 ein Major statt eines Minors, und die Einplanung ist neu zu bewerten.
- **Kein Subagent** (2026-07-27). Die Session-Anweisung verbietet den Agent-Tool-Einsatz ohne ausdrücklichen Auftrag; der Orchestrator schreibt selbst. Verify- und Commit-Regeln des Skills gelten unverändert, Commits mit `--no-gpg-sign`.

## Vorbestehende Fehler

Keine. Die Baseline ist auf ganzer Breite grün — jeder rote Lauf ab hier gehört dem laufenden Paket.

## Reihenfolge

1 → 2 → 3 → 4. Paket 1 ist unabhängig. Paket 2 und 3 fassen beide `src/eventize-api.ts` an und dürfen sich nicht überlappen; 2 geht zuerst, weil es dieselbe Doku-Passage in `docs/lifecycle.md` berührt, die 3 danach nicht mehr anfassen muss. Paket 4 ist reine DX und steht am Ende, damit sein breiter Spec-Diff keinen inhaltlichen Diff überdeckt.

## Pakete

### [x] 1. Interne `any` durch explizite Typen ersetzen

- Ziel: Wo ein präziser Typ verfügbar ist, steht kein `any` mehr — ohne dass sich eine öffentliche Signatur ändert.
- Dateien: `src/eventize-api.ts`, `src/EventStore.ts`, `src/utils.ts`
- Verify: `npm run typecheck && npm test`, danach `npm run cbt`
- Commit: `refactor(types): replace internal any with explicit types`
- Hash: `25bb293`
- Zwei Stellen kamen beim Arbeiten dazu, die der Plan nicht nannte: `EventStore.removeItemFromArray()` und `EventListener`s `ReturnValue`-Callback. Sechs statt vier.

**Befund · `src/eventize-api.ts:663,683,704`** — die Implementierungssignaturen von `retain()`, `retainClear()` und `unretain()` führen `eventNames: any`, während `emit()` an derselben Stelle `AnyEventNames` deklariert und `off()` ehrlich `unknown` nimmt. Die öffentlichen Overloads sind in allen drei Fällen sauber typisiert; das `any` wirkt nur nach innen, wo es jede Weiterprüfung im Funktionsrumpf abschaltet. Die Umstellung auf `AnyEventNames` wurde am 2026-07-27 durchgespielt: `tsc --noEmit` Exit 0, keine Folgefehler, Probe zurückgerollt.

**Befund · `src/EventStore.ts:123-124`** — der Parametertyp von `isSimilar()` deklariert `listenerObject: any` und `listener: any`. Der Rumpf vergleicht beide ausschließlich auf Gleichheit, `unknown` genügt also vollständig und ist hier die ehrlichere Angabe: der Store weiß tatsächlich nicht, was in den Slots steckt.

**Befund · `src/utils.ts:69`** — `type PropertyValue = any`, benutzt als Werttyp von `defineHiddenPropertyRO()`. Auch hier reicht `unknown`: die Funktion reicht den Wert unverändert an `Object.defineProperty` weiter.

Umsetzungsschritte:

1. Die drei Implementierungssignaturen der retain-Familie auf `AnyEventNames`.
2. `isSimilar()`s Parametertyp auf `unknown` für beide Slots; falls der Rumpf dadurch bricht, ist das ein echter Fund und wird einzeln bewertet, nicht weggecastet.
3. `PropertyValue` auf `unknown`.
4. Kein CHANGELOG-Eintrag als Bruch — höchstens eine Zeile unter Unreleased als interne Verschärfung. `AGENTS.md` bleibt unberührt.

### [x] 2. Ein verbrauchtes Handle gibt auch seinen Listener frei

- Ziel: Nach dem ersten Aufruf hält das Handle nichts mehr — weder den Emitter noch den `EventListener`.
- Dateien: `src/eventize-api.ts`, `src/lifecycle.spec.ts`, `docs/lifecycle.md`, `AGENTS.md`, `CHANGELOG.md`
- Verify: `npm test -- src/lifecycle.spec.ts` als Schleife, danach `npx jest --clearCache && npm run cbt`
- Commit: `fix(api): release the captured listener when a handle is consumed`
- Hash: `46974da`
- Der Pin wurde zuerst umgebaut und rot gesehen (`still reachable` statt `collected`), dann der Code geändert. Ohne den Umbau hätte der Test die Änderung nicht messen können.

**Befund · `src/eventize-api.ts:55-66`** — `makeUnsubscribe()` nullt beim ersten Aufruf `heldHost`, nicht aber den `listeners`-Capture. Die Begründung dafür steht in `AGENTS.md:56` und lautete: Nullen gibt nichts frei, weil `Object.assign` dieselbe Referenz als `.listener` / `.listeners` öffentlich ans Handle hängt. Mit v6.3.0 sind diese Properties weg, und die Closure ist die einzige verbleibende Referenz. Die Begründung ist damit hinfällig.

Die Wirkung hängt daran, was der Aufruf ausgerichtet hat. Ging der Referenzzähler auf null, ist der Listener bereits detached und seine Felder sind genullt — das Handle hält eine leere Hülle, der Gewinn ist marginal. Dekrementierte der Aufruf dagegen nur von 2 auf 1, bleibt der Listener registriert und vollständig besetzt, und über ihn ist der Emitter erreichbar: über `callAfterApply` (ein `on()`, das auf ein wartendes `once()` deduplizierte) oder über den Listener-Objekt-Slot (der Emitter als eigener Listener). Heute hält ein verbrauchtes Handle diesen Pfad offen; das ist genau die Einschränkung, die `docs/lifecycle.md` unter „A consumed handle is not automatically reference-free" und `AGENTS.md:57` benennen.

Damit erledigt sich der Speicheraspekt von MEM-002, ohne die Dedup-Regel anzufassen — der Preis, den `AGENTS.md` als „nie beziffert" führt (`findSimilarListener()` verweigert die Deduplizierung auf einen Listener mit `callAfterApply`), fällt nicht an. MEM-002s Kern bleibt: ein Zähler, dessen Freigabelogik zwei Lebensdauern teilt.

Umsetzungsschritte:

1. `makeUnsubscribe()` führt beide Referenzen in **einem** Slot, damit ein Null-Test genügt und TypeScript beide Felder gemeinsam verengt:

   ```ts
   let held: {
     host: EventizedObject;
     listeners: EventListener | Array<EventListener>;
   } | null = {host, listeners};

   return () => {
     const target = held;
     if (target === null) return;
     held = null;
     off(target.host, target.listeners);
   };
   ```

   Zwei getrennte `let` mit zwei Null-Tests täten es auch, kosten aber einen Zweig, der nie genommen wird — beide werden immer zusammen genullt.
2. **Zuerst den bestehenden Pin umbauen, sonst ist die Änderung unmessbar.** `src/lifecycle.spec.ts`, Fall `a shared registration still releases the emitter — unless the surviving listener leads back to it`: `onDedupedOntoAPendingOnce()` gibt heute `handle` *und* `listener` zurück. Solange der Test den Listener selbst hält, bleibt der Emitter erreichbar, egal was die Closure tut. Der Listener darf den Helper nicht mehr verlassen; die Assertions auf `isRemoved` / `callAfterApply` wandern in den Helper oder entfallen.
3. Danach kippt das Verdict dieses Falls von `/^still reachable.*harness ok/` auf `/^collected/`. Das ist die eigentliche Aussage der Änderung und gehört als solche benannt — der Fall bekommt einen Titel, der sie trägt.
4. Ein neuer `WeakRef`-Fall für den refCount-2-Pfad mit Kontrollgruppe: verbrauchtes Handle behalten, Emitter muss trotzdem einsammelbar sein. Ohne Kontrollgruppe beweist eine `collected`-Erwartung nichts, wenn der Collector kaputt ist — `src/__test-utils__/gc.ts` liefert das Verdict, das beides unterscheidet.
5. `docs/lifecycle.md`: der Warnblock unter [Which handles to keep] und der Schlussabsatz der Reference-Counting-Notiz behaupten beide, ein verbrauchtes Handle könne den Emitter über den überlebenden Listener halten. Nach der Änderung stimmt das für das *verbrauchte* Handle nicht mehr — wohl aber für ein **nie aufgerufenes** Handle, und genau diese Unterscheidung muss der Text danach führen.
6. `AGENTS.md:56` (die Begründung, warum nicht genullt wird — sie entfällt) und `AGENTS.md:57` (der Umfang der Einschränkung).
7. `CHANGELOG.md` unter Unreleased: Fix, mit einem Satz dazu, welcher Teil von MEM-002 damit erledigt ist und welcher ausdrücklich nicht.

### [x] 3. `EventizedObject` gibt Store und Keeper nicht mehr strukturell preis

- Ziel: Die internen Klassen verschwinden aus der veröffentlichten Typoberfläche, ohne dass ein Konsument etwas verliert.
- Dateien: `src/types.ts`, `src/asEventized.ts`, `src/eventize-api.ts`, `src/eventize.ts`, `src/isEventized.ts`, `src/getSubscriptionCount.ts`, `src/getRetainedCount.ts`, `CHANGELOG.md`, `AGENTS.md`
- Verify: `npx jest --clearCache && npm run cbt`, dazu eine Konsumenten-Probe gegen `lib/index.d.ts`
- Commit: `refactor(types)!: keep EventStore and EventKeeper out of the published surface`
- Hash: `c5e63fe`
- Abbruchkriterium eingehalten: genau ein neuer Cast, in `src/internals.ts`. `declare class` in `lib/index.d.ts` von 4 auf 1.

**Befund · `src/types.ts:76-90`** — der exportierte Typ `EventizedObject` deklariert `[NAMESPACE]: {keeper: EventKeeper; store: EventStore}`. Dadurch führt `lib/index.d.ts` alle drei internen Klassen vollständig mit: `EventKeeper` (Zeile 9), `EventListener` (29) und `EventStore` (67), samt ihrer privaten Methodennamen.

Nutzbar ist das für einen Konsumenten nicht, geprüft am 2026-07-27 gegen die gebaute `lib/index.d.ts`: `EventStore` ist nicht nennbar (`TS2694`), und der `NAMESPACE`-Schlüssel ist ein nicht exportiertes `unique symbol`, ein Umweg über `Symbol.for('eventize')` endet in `TS7053`. Das ist also kein Leck wie API-001, sondern Ballast — und eine Grenze, die im Typ nicht steht, wo sie im Code längst gilt.

Umsetzungsschritte:

1. In `src/types.ts` einen **nicht exportierten** Strukturtyp einführen (etwa `EventizeInternals`) und `EventizedObject` den Slot nur noch opak führen. Der interne Vollzugriff bekommt einen eigenen, nicht exportierten Typ (`EventizedObjectInternal`), den `asEventized()` liefert.
2. Alle internen Lesestellen von `obj[NAMESPACE]` auf den internen Typ ziehen. Betroffen sind acht Dateien, gezählt über `grep -c EventizedObject src/*.ts`; die Zugriffe selbst sitzen in `eventize-api.ts`, `getSubscriptionCount.ts`, `getRetainedCount.ts` und `eventize.ts`.
3. Die Grenze kostet genau **einen** Cast, in `asEventized()`, mit Begründung im Kommentar. Mehr als einen: dann ist der Schnitt falsch gelegt und wird neu gelegt, nicht mit weiteren Casts geflickt.
4. `src/__test-utils__/listeners.ts` liest den Store und muss den internen Typ nehmen. Das ist der Lackmustest: geht es dort ohne Cast, stimmt der Schnitt.
5. Nach dem Build verifizieren, dass `EventKeeper`, `EventStore` und `EventListener` aus `lib/index.d.ts` verschwunden sind — `grep -c "declare class"` muss von 4 auf 1 fallen (`Eventize` bleibt).
6. `CHANGELOG.md`: Typbruch. Betroffen ist Code, der den Slot strukturell annotiert hat; dass es davon Exemplare gibt, ist unwahrscheinlich, aber es ist ein Bruch und wird als solcher geführt.
7. `AGENTS.md`: der Abschnitt „The eventized marker" beschreibt den Slot und braucht die neue Grenze.

**Abbruchkriterium:** Braucht der Umbau mehr als einen Cast an der Grenze oder greift er in die Dispatch-Pfade ein, wird das Paket blockiert und berichtet statt durchgedrückt. Der Gewinn ist Klarheit, nicht das Schließen eines Lecks — er rechtfertigt keinen unruhigen Diff im Kern.

### [x] 4. Verbleibende Test-Suppressions und ein deprecated Alias (Abschluss siehe unten)

- Ziel: Die letzten Suppressions in `on.spec.ts` verschwinden, und kein Spec benutzt mehr einen als deprecated markierten Alias.
- Dateien: `src/on.spec.ts`, `src/documented-quirks.spec.ts`
- Verify: `npm run cbt`
- Commit: `test: type the listener fixtures instead of suppressing this-assignments`
- Hash: `33f5246`
- 21 → 3 Direktiven. Die drei überlebenden sind absichtlich und tragen bereits eine Begründung.

**Befund · `src/on.spec.ts`** — 21 `@ts-expect-error` sind übrig, nachdem der API-001-Lauf 61 entfernt hat. Sie haben mit der alten Union nichts zu tun: sie unterdrücken Zuweisungen an `this` in Listener-Rümpfen, mit denen die Specs den Aufrufkontext einfangen (`this.context = this`, `context = this`). Eine typisierte Fixture — ein Listener-Objekt mit deklarierten `context` / `args`-Feldern und ein `function`-Listener mit `this`-Parameter — löst sie ohne Suppression ab.

**Befund · `src/documented-quirks.spec.ts:64`** — benutzt `Priority.Default`. Der Alias ist auf `EventizePriority` als `@deprecated` markiert und laut `README.md:396` für ein künftiges Major zur Entfernung vorgesehen. `Priority.Normal` trägt denselben Wert.

Umsetzungsschritte:

1. Eine typisierte Listener-Fixture in `src/on.spec.ts` einführen und die 21 Suppressions daran ablösen. Bleibt eine übrig, die sich nicht auflösen lässt, bekommt sie eine Begründung als Kommentar statt einer stillen Direktive.
2. `Priority.Default` → `Priority.Normal`. Prüfen, ob andere Specs den Alias absichtlich benutzen, um ihn zu testen — ein solcher Fall bleibt stehen.
3. Kein CHANGELOG-Eintrag, keine Doku. Reine Testarbeit.

## Abschluss

**Ergebnis:** 4 Pakete, 5 Commits plus Abschluss-Commit. Kein Paket blockiert, kein Stash. Voller `cbt` grün nach geleertem ts-jest-Cache: 29 Suiten / 682 Fälle (Baseline 678), Coverage 99.82 / 98.33 / 99.23 / 100, `attw` 4/4, `typecheck` Exit 0.

Fünf statt vier Commits, weil während Paket 1 auffiel, dass **TYPE-003 aus dem Vorlauf nur auf einer von drei API-Oberflächen umgesetzt war**: `src/eventize.ts` führt eigene Signaturen für `eventize.inject(obj).emitAsync()` und `Eventize#emitAsync()`, beide standen weiter auf `Promise<any>`. `any` ist bidirektional zuweisbar, deshalb fiel es beim Implementieren des bereits verengten `EventizeApi` nicht auf, und der Harness-Typ in `expect2ImplEventizeApi.ts` trug dieselbe Lücke — die Konformitätssuite hätte es also auch nicht fangen können. Nachgezogen in `6768f1c`, mit einem Typ-Pin pro Oberfläche in `api-surfaces.spec.ts`.

**Coverage:** Branch-Deckung 98.01 → 98.33, weil Paket 3 zwei defensive `?.` in `getSubscriptionCount()` und `getRetainedCount()` überflüssig machte — `isEventized()` ist genau der Test, dass der Slot besetzt ist. Beide Dateien stehen jetzt auf 100 % Branch. `coverageThreshold.branches` **angehoben** 97.5 → 98, nicht gesenkt.

**Semver: `6.3.0` → `6.4.0`, Minor trotz zweier Typbrüche** (Paket 3 und der TYPE-003-Nachtrag). Erneut verifiziert: `npm view @spearwolf/eventize dist-tags` liefert `latest: 5.1.0`. Es gilt weiterhin, was seit `v6.1.0` gilt und was mit dem ersten veröffentlichten 6.x endet.

**Was der Lauf nicht angefasst hat:**

1. **MEM-002 selbst.** `findSimilarListener()` dedupliziert weiterhin auf einen Listener mit gesetztem `callAfterApply`, also spannt ein Referenzzähler weiter zwei Lebensdauern. Paket 2 hat nur die Speicherfolge beseitigt, und auch die nur für Handles, die tatsächlich aufgerufen wurden. Ein nie aufgerufenes Handle hält den Emitter weiter — das ist Absicht und hat jetzt eine eigene Kontrollgruppe im Spec.
2. **`audit.html`.** Wer sich selbst benotet, hat immer bestanden. Die Verifikation gehört in einen Folgelauf von `js-ts-project-audit`, der auch API-001, TYPE-003 und die übrigen offenen Findings (CI-003, DEP-003, DX-002, TEST-002, BUILD-003) am Code prüft.
