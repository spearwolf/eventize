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

---

## Offen / Diskussion nötig

### ⚡ 29. Bundle-Größe verfolgen
Aktuell ~4.7 KB gzipped (ESM). README behauptet `<5k` — derzeit knapp eingehalten. Bei Aufgabe 23 (Generic-Typen) wird Code nicht größer (nur Types), aber `unretain` (13) und Overloads (15) bringen ein paar Bytes. Vor Release prüfen, ob das `<5k`-Versprechen noch hält. Sonst README anpassen.
