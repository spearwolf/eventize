# TODO

Aufgaben aus der Konsistenz- und Qualitätsanalyse von `@spearwolf/eventize` v4.0.2.
Sortiert nach Release-Zielen und Priorität. Jeder Punkt ist so formuliert, dass er einzeln angegangen werden kann.

Legende: 🔴 Bug · 🟡 API-Hygiene · 🟢 DX/Doku · 🔵 Refactor · ⚡ Performance

---

## Minor-Release (geplant für `v4.1.0`)

Kann breaking-frei eingeführt werden. Verbessert Konsistenz und DX deutlich.

### 🟡 13. `unretain(ε, eventNames)` als public API
**Dateien:** `src/eventize-api.ts`, `src/eventize.ts`, `src/index.ts`, README
**Problem:** Einmal `retain(ε, 'foo')` aufgerufen, gibt es **keine Möglichkeit**, das wieder zurückzunehmen. `EventKeeper.remove` existiert intern, ist aber nicht exportiert. `retainClear` löscht nur den gespeicherten Wert, nicht die "retain-Pflicht".
**Fix:** `unretain(obj, eventNames)` exportieren, das `keeper.remove(eventNames)` aufruft. In `Eventize`-Klasse und `inject()` analog ergänzen.
**Test:** Spec, der `retain → emit → unretain → on (neuer subscriber) → kein Replay` verifiziert.

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
