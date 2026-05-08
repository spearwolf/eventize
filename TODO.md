# TODO

Aufgaben aus der Konsistenz- und Qualitätsanalyse von `@spearwolf/eventize` v4.0.2.
Sortiert nach Release-Zielen und Priorität. Jeder Punkt ist so formuliert, dass er einzeln angegangen werden kann.

Legende: 🔴 Bug · 🟡 API-Hygiene · 🟢 DX/Doku · 🔵 Refactor · ⚡ Performance

---

## Minor-Release (geplant für `v4.1.0`)

Kann breaking-frei eingeführt werden. Verbessert Konsistenz und DX deutlich.

### 🟢 19. README: TypeScript-Type-Safety-Kapitel
**Datei:** `README.md`
**Problem:** Library wirbt mit "Full TypeScript Support", aber `EventArgs = Array<any>`. Es fehlt ein Beispiel, wie man Events typisiert (heute: gar nicht).
**Fix:** Bis Aufgabe 23 umgesetzt ist: ehrlich beschreiben, dass Argumente untyped sind und ein Wrapper-Pattern für getypte Events vorschlagen. Danach: echtes Generic-Beispiel.


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
