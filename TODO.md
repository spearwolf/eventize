# TODO

Aufgaben aus der Konsistenz- und Qualitätsanalyse von `@spearwolf/eventize` v4.0.2.
Sortiert nach Release-Zielen und Priorität. Jeder Punkt ist so formuliert, dass er einzeln angegangen werden kann.

Legende: 🔴 Bug · 🟡 API-Hygiene · 🟢 DX/Doku · 🔵 Refactor · ⚡ Performance

---

## Offen / Diskussion nötig

### ⚡ 29. Bundle-Größe verfolgen
Aktuell ~4.7 KB gzipped (ESM). README behauptet `<5k` — derzeit knapp eingehalten. Aufgabe 23 (Generic-Typen) hat den Code _nicht_ wachsen lassen (rein Type-Layer), aber `unretain` (13) und Overloads (15) bringen ein paar Bytes. Vor Release prüfen, ob das `<5k`-Versprechen noch hält. Sonst README anpassen.
