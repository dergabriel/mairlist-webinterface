# 🔬 FIELD-SEMANTICS.md

Feldbedeutungen direkt aus einer echten mAirListDB (SQLite `.mldb`) abgeleitet. Das ist das Kronjuwel: nicht geraten, sondern aus echten Daten.

> Quelle: JUKA-Datenbank (nicht produktiver Testsender, mAirList 8.x)

---

## ✅ Bestätigte Einheiten und Formate

### `items.duration` — Sekunden als REAL

Beispiele aus der echten DB:
```
155.425   (Lemonade - Louis Tomlinson)
185.588   (Next to Normal - Lucius)
166.593   (Etincelles - Luiza & Carbonne)
```

**Einheit: Sekunden mit Dezimalstellen.** Unsere bisherige Annahme war richtig.

---

### `item_cuemarkers.value` — Sekunden als REAL

Beispiele für Item 1 (Lemonade, duration=155.425):
```
CueIn   = 0.093   (Stille am Anfang überspringen)
Ramp1   = 20.515  (Einstiegspunkt für Intro)
Outro   = 151.995 (Beginn des Outros)
FadeOut = 155.518 (Fade beginnt, überschreitet leicht duration)
CueOut  = 156.717 (Ende, auch über duration)
```

**Einheit: Sekunden als REAL. CueOut und FadeOut können > duration liegen.**

Die bisherige `toStorage`/`fromStorage` Identitätsfunktion in ItemEditor.jsx ist korrekt, keine Umrechnung nötig.

---

### `item_cuemarkers.type` — PascalCase Strings

Exakte Werte aus der DB:
```
CueIn, CueOut, FadeIn, FadeOut, FadeEnd
Ramp1, Ramp2, Ramp3
HookIn, HookOut
Outro, StartNext, Preroll
```

Unsere bisherigen Keys (`cueIn`, `fadeOut` etc.) müssen beim Lesen/Schreiben gemappt werden:

| Unser Key | DB-Typ |
|---|---|
| `cueIn` | `CueIn` |
| `cueOut` | `CueOut` |
| `fadeIn` | `FadeIn` |
| `fadeOut` | `FadeOut` |
| `fadeEnd` | `FadeEnd` |
| `ramp1` | `Ramp1` |
| `ramp2` | `Ramp2` |
| `ramp3` | `Ramp3` |
| `hookIn` | `HookIn` |
| `hookOut` | `HookOut` |
| `outro` | `Outro` |
| `startNext` | `StartNext` |
| `preroll` | `Preroll` |

> ⚠️ Aus der Doku bekannt, aber nicht in dieser DB: `LoopIn`, `LoopOut`, `HookFade`, `Anchor`. Diese Typen sind im echten Client vorhanden, waren in dieser Testdatenbank nicht gesetzt.

---

### `items.type` — Freie VARCHAR Strings, PascalCase

Echte Werte aus der DB:
```
Music, Jingle, Drop, Sweeper
```

Kein Enum, kein SQL-Constraint. Jeder String ist möglich. Unsere erweiterte Liste (News, Weather, Traffic, Moderation, Bed, Stream, Container, Dummy, Silence) ist valide.

---

### `playlist.slot` — DATETIME, Stundenformat

```
Mitternacht:    2026-03-21
Andere Stunden: 2026-03-21 08:00:00.000
```

Für Abfragen immer `LIKE '2026-03-21%'` für einen Tag, oder exaktes Match `= '2026-03-21 08:00:00.000'` für eine Stunde.

---

### `playlist.timing` + `playlist.fixtime`

Fix-Zeiten funktionieren so:
- `timing = 'Soft'` + `fixtime = '00:00:00.000'` → Item hat eine feste Startzeit
- `timing = NULL` → normales Item, keine Fix-Zeit

---

### `item_attributes` — Alle Werte als VARCHAR

Auch Zahlen werden als Text gespeichert:
```
BPM = "86"
Jahr = "1994"
Track = "8"
ISRC = "USLF29400133"
```

Beim Lesen: `parseInt()` oder `parseFloat()` je nach Attribut-Definition.

---

### `items.filename` — Relativer Pfad im Storage

```
Louis Tomlinson - Lemonade.mp3
Luiza - Etincelles.mp3
```

Kein Unterordner in dieser DB. Vollständiger Pfad = `storages.defaultLocation + '\' + items.filename`.

---

## ❓ Noch zu klären (per Diff-Methode in der Produktiv-DB)

Diese Felder sind in der Schema bekannt, aber der genaue Inhalt war in der Testdatenbank leer oder unklar:

| Feld | Offene Frage |
|---|---|
| `items.color` | Welches Format? RGB-Hex, Integer, Named Color? |
| `items.endtype` | Welche Werte? ("Normal", "Immediate", "WaitForEnd"?) |
| `items.options` | Was steht da drin? Kommasepariert, JSON, XML? |
| `item_cuedata.xmldata` | Format der Hüllkurven-Daten für den Mix Editor |
| `playlist.xmldata` | Format der lokalen Overrides im Playlist-Eintrag |
| `item_containercontent` | Wie sind Container-Inhalte verknüpft? |
| `items.level_loudness` | Einheit? LUFS? Stimmt -14 LUFS als Zielwert? |
