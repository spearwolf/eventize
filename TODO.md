# TODO

Aufgaben aus der Konsistenz- und Qualitätsanalyse von `@spearwolf/eventize` v4.0.2.
Sortiert nach Release-Zielen und Priorität. Jeder Punkt ist so formuliert, dass er einzeln angegangen werden kann.

Legende: 🔴 Bug · 🟡 API-Hygiene · 🟢 DX/Doku · 🔵 Refactor · ⚡ Performance

---

## Patch-Release (geplant für `v4.0.3`)

Niedriges Risiko, keine Breaking Changes, sollte kurzfristig erledigt werden.

### 🔴 10. Test: `once` mit retained event + Array von Eventnamen
**Datei:** `src/onceAsync.spec.ts` oder `src/once.spec.ts`
**Problem:** Bei `retain(ε, 'foo'); emit(ε, 'foo', x); once(ε, ['foo', 'bar'], fn)` läuft `subscribeTo` **vor** dem Anhängen von `callAfterApply` durch `once`. Wenn der retained Replay den Listener feuert, ist `unsubscribe` noch nicht angehängt — vermuteter Edge-Case.
**Fix:** Spec, der nach dem retained-Replay `getSubscriptionCount(ε)` als 0 erwartet (analog zu Live-Emit). Falls der Test fehlschlägt: in `once()` zuerst `afterApply` registrieren, dann `EventKeeper.publish` flushen — siehe Aufgabe 17.

---

## Minor-Release (geplant für `v4.1.0`)

Kann breaking-frei eingeführt werden. Verbessert Konsistenz und DX deutlich.

### 🟡 13. `unretain(ε, eventNames)` als public API
**Dateien:** `src/eventize-api.ts`, `src/eventize.ts`, `src/index.ts`, README
**Problem:** Einmal `retain(ε, 'foo')` aufgerufen, gibt es **keine Möglichkeit**, das wieder zurückzunehmen. `EventKeeper.remove` existiert intern, ist aber nicht exportiert. `retainClear` löscht nur den gespeicherten Wert, nicht die "retain-Pflicht".
**Fix:** `unretain(obj, eventNames)` exportieren, das `keeper.remove(eventNames)` aufruft. In `Eventize`-Klasse und `inject()` analog ergänzen.
**Test:** Spec, der `retain → emit → unretain → on (neuer subscriber) → kein Replay` verifiziert.

### 🟡 14. Konsistente Fehlerstrategie zwischen Subscribe- und Emit-Pfad
**Datei:** `src/eventize-api.ts`
**Problem:** `on/once/retain` rufen auto-`asEventized()` auf nicht-eventized Objekten auf. `emit/emitAsync/off/retainClear` werfen `'object is not eventized'`. Asymmetrie ist verwirrend.
**Optionen:**
- (A) Tolerant: `emit/off/retainClear` ebenfalls auto-eventizen. Vorteil: konsistent. Nachteil: `emit({}, …)` funktioniert nun stillschweigend ohne Listener — ist das wünschenswert?
- (B) Strikt: `on/once/retain` werfen ebenfalls. Sauberer, aber Breaking Change → besser in v5.
**Fix für v4.1:** Variante A. README anpassen, Edge-Case-Specs erweitern.

### 🟡 15. Overload-Signaturen für `on` / `once` statt Tupel-Union
**Datei:** `src/types.ts`, `src/eventize-api.ts`
**Problem:** `SubscribeArgs` ist eine Union aus 14 Tupel-Permutationen. IDE-Autocomplete zeigt das alles in einer einzigen unleserlichen Zeile.
**Fix:** Function-Overloads:
```ts
export function on(obj, eventName: EventName, listener: ListenerFuncType): UnsubscribeFunc;
export function on(obj, eventName: EventName, priority: number, listener: ListenerFuncType): UnsubscribeFunc;
export function on(obj, eventNames: EventName[], listener: ListenerFuncType): UnsubscribeFunc;
…
```
plus eine Implementation-Signature, die intern alles akzeptiert.
**Achtung:** Reihenfolge der Overloads ist wichtig (spezifisch → generisch).

### 🔵 16. `EventStore.remove` refactoren
**Datei:** `src/EventStore.ts:151-247`
**Problem:** Die Funktion ist mit `// TODO clean up this messy function!` markiert. 7 verschachtelte Branches, überlappende Bedingungen, schwer zu lesen.
**Fix:** Aufsplitten in:
- `removeByEventName(name)` (für `off(ε, 'foo')`)
- `removeByListenerObject(obj)` (für `off(ε, obj)`)
- `removeByListenerFunc(fn, obj?)` (für `off(ε, fn[, obj])`)
- `removeByEventListener(el)` (für unsubscribe-Funktion)
- `removeAll()` (für `off(ε)` und `off(ε, '*')`)
und einen schlanken Dispatcher davor. Vorhandene Specs müssen weiterhin grün bleiben.

### 🔴 17. `once` + retain: Reihenfolge fixen
**Datei:** `src/eventize-api.ts:64-82`
**Abhängig von:** Aufgabe 10 (zuerst Test schreiben)
**Problem:** `subscribeTo` triggert `EventKeeper.publish` direkt — bei `once` mit retained Event läuft der Listener, bevor `callAfterApply` angehängt ist.
**Fix:** In `once()` zuerst `_subscribeTo` ohne automatischen Publish aufrufen, `callAfterApply` setzen, dann `EventKeeper.publish` manuell flushen. Erfordert eine kleine API-Änderung an `subscribeTo` (z.B. zwei-stufiger Aufruf oder Callback-Parameter).

### ⚡ 18. Sortierte Insertion statt `arr.sort()` bei `add`
**Datei:** `src/EventStore.ts`
**Problem:** Jeder `on()` ruft `arr.sort(sortByPriorityAndId)` → O(n log n). Bei vielen Listenern unnötig.
**Fix:** Binary-Search-Insertion (O(log n) Suche, O(n) Shift). Profitiert von der bereits sortierten Liste.
**Hinweis:** Mikro-Optimierung — nur sinnvoll, wenn ein Use-Case mit >1000 Listenern dokumentiert ist. Sonst skip.

### 🟢 19. README: TypeScript-Type-Safety-Kapitel
**Datei:** `README.md`
**Problem:** Library wirbt mit "Full TypeScript Support", aber `EventArgs = Array<any>`. Es fehlt ein Beispiel, wie man Events typisiert (heute: gar nicht).
**Fix:** Bis Aufgabe 23 umgesetzt ist: ehrlich beschreiben, dass Argumente untyped sind und ein Wrapper-Pattern für getypte Events vorschlagen. Danach: echtes Generic-Beispiel.

### 🟢 20. README: Wildcard-Konstante statt Magic String
**Datei:** `README.md`
**Abhängig von:** Aufgabe 2
**Fix:** In allen Beispielen, die `'*'` zeigen, optional auf `EVENT_CATCH_EM_ALL` verweisen.

### 🔵 21. `expect2ImplEventizeApi` nach `__test-utils__/` verschieben
**Datei:** `src/expect2ImplEventizeApi.ts`
**Problem:** Test-Helper liegt im Production-Source-Verzeichnis. Wird nicht exportiert (gut), aber wirkt wie API.
**Fix:** Verschieben nach `src/__test-utils__/expect2ImplEventizeApi.ts` oder direkt in die zwei nutzenden Specs inlinen (es ist nur 28 Zeilen).

### 🔵 22. Globale Counter überdenken
**Dateien:** `src/EventListener.ts:48`, `src/EventKeeper.ts:14`
**Problem:** Modul-globaler `lastId` und `nextOrderId`. In der Praxis OK (Number-Overflow erst nach >9 Billionen Events), aber unhygienisch.
**Optionen:** Counter pro `EventStore`/`EventKeeper`-Instanz. Reset wäre damit lokal möglich.
**Priorität:** Niedrig, nur wenn man die Klassen ohnehin anfasst.

---

## Major-Release (geplant für `v5.0.0`)

Breaking Changes. Nur in einer geplanten Major-Iteration angehen.

### 🟢 23. Generic Event-Map Support
**Dateien:** ganzes `types.ts` und API-Layer
**Problem:** Heute akzeptiert `emit(ε, 'foo', any, …)` alles. Moderne TS-Eventbibliotheken (mitt, EventTarget mit CustomEvent, RxJS Subjects) bieten typed events:
```ts
interface MyEvents { 'data': [string, number]; 'close': []; }
const ε = eventize<MyEvents>();
on(ε, 'data', (s, n) => …);  // s: string, n: number — getypt
emit(ε, 'data', 'hello', 42); // typecheck
```
**Fix:** Generic-Parameter `<TEvents extends EventMap>` durchziehen. Achtung: Kompatibilität mit Listener-Objekt-Pattern (`on(ε, {foo() {…}})`) — Eventnamen aus dem Methodennamen, also Mapping über `keyof TEvents` und `Parameters<TEvents[K]>`.
**Migration:** Default `TEvents = Record<EventName, any[]>` für Abwärtskompatibilität.

### 🟢 24. `Priority`-Aliase mit verständlichen Namen
**Datei:** `src/Priority.ts`
**Problem:** `AAA / BB / C` ist unintuitiv (warum doppelt-A? warum keine `AA` zwischen `AAA` und `BB`?).
**Fix:** Aliase nicht-breaking:
```ts
export const Priority = {
  Max: …, Critical: 1e9, High: 1e6, Normal: 0, Low: -1e4, Min: …,
  // Legacy aliases
  AAA: 1e9, BB: 1e6, C: 1e3, Default: 0,
} as const;
```
In v5: alte Namen deprecated markieren. In v6: entfernen.

### 🔵 25. `EventKeeper.emit` umbenennen
**Datei:** `src/EventKeeper.ts`
**Problem:** Methodenname `emit` ist irreführend — die Methode "replayed" retained events an einen neuen Listener, sie emittet nichts neues.
**Fix:** Umbenennen in `replayTo(listener)` o.ä. Intern, nicht breaking für Public-API-Nutzer (Klasse ist nicht exportiert).

### 🟡 26. Strikte Fehlerstrategie statt Auto-Eventize
**Datei:** `src/eventize-api.ts`
**Abhängig von:** Aufgabe 14 (sofern Variante A für v4.1 gewählt wurde, ist das hier die Umkehrung)
**Überlegung:** `on/once/retain` sollten genauso wie `emit/off/retainClear` werfen, wenn das Objekt nicht eventized ist. Aktuelles Verhalten (auto-eventize bei subscribe) versteckt Bugs (Tippfehler im Variablennamen → stilles Eventize eines anderen Objekts).
**Migration:** Klar in CHANGELOG vermerken, README umstellen.

### 🟢 27. Listener-Exception-Handling überdenken
**Abhängig von:** Aufgabe 7, 8
**Problem:** Ein wirfender Listener bricht heute alle nachfolgenden Listener im selben Emit. Alternative: alle Listener trotzdem ausführen, Errors sammeln, am Ende werfen (`AggregateError`) oder per optionalem Hook (`onListenerError`).
**Fix-Optionen:** Pro-Emit-Option oder global per `eventize`-Konfiguration. Diskussion vor Implementierung.

---

## Offen / Diskussion nötig

### 🟢 28. Multi-Realm / Multi-Version-Koexistenz dokumentieren
Mehrere Versionen von `@spearwolf/eventize` in derselben App teilen `Symbol.for('eventize')`, aber die `EventStore`/`EventKeeper`-Klassen sind versionsspezifisch. `isEventized` würde true zurückgeben für ein Objekt aus einer fremden Version — Aufrufe würden dann fehlschlagen.
Abhilfe: in `isEventized` zusätzlich `instanceof EventStore` prüfen, oder eine Versionsmarkierung im NAMESPACE-Slot. Erst angehen, wenn ein Issue dazu auftaucht.

### ⚡ 29. Bundle-Größe verfolgen
Aktuell ~4.7 KB gzipped (ESM). README behauptet `<5k` — derzeit knapp eingehalten. Bei Aufgabe 23 (Generic-Typen) wird Code nicht größer (nur Types), aber `unretain` (13) und Overloads (15) bringen ein paar Bytes. Vor Release prüfen, ob das `<5k`-Versprechen noch hält. Sonst README anpassen.
