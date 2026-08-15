# ✨ Funktionskatalog

Vollständiger Funktionsumfang des mAirListDB Clients, recherchiert aus der offiziellen Doku (mairlist.docs.mairlist.com), dem alten Wiki (wiki.mairlist.com), den Release Notes und dem Community Forum. Die neue Doku ist teilweise unvollständig (Scheduling und Mix Editor sind dort leere Stubs), diese Lücken wurden aus Wiki, Release Notes und Forum gefüllt.

Legende: ✅ fertig (gegen Mock) · 🚧 in Arbeit · ⬜ offen · 🔽 späte Phase · ❌ außerhalb des Scopes

## 🗺️ Phasen-Status

| Phase | Inhalt | Status |
|---|---|---|
| A | Frontend gegen Mock: Elemente-Liste, Item Editor (alle 6 Tabs), Cue Editor (Marker, Zoom, Prioritätssortierung), Datei-Upload, Playlist im mAirList Layout, leere Stunden, Drag-and-Drop, lokale Overrides vs. DB-Speichern | ✅ vollständig fertig |
| B–F | siehe Bereichs-Tabellen unten (Bibliothek-Feinheiten, Mix Editor, Voice Tracking, Mehrbenutzer etc.) | ⬜ offen |
| G | Echte Datenbank: `.mldb` (SQLite) statt Mock anbinden | ✅ fertig |
| H, I | unverändert offen | ⬜ offen |

**Phase G – abgeschlossen:**
- `server/data/sqlRepository.js` erstellt mit `better-sqlite3`, identische Signaturen zu `repository.js`
- Spalten-Mapping vollständig: `items`, `item_cuemarkers`, `item_attributes`, `item_folders`, `playlist`
- Cue-Typ-Mapping implementiert: camelCase Code ↔ PascalCase DB (`cueIn` ↔ `CueIn` etc.)
- Playlist-Slot-Format korrekt geparst (Mitternacht ohne Uhrzeit, andere Stunden mit `.000`)
- Umschalten per `DATA_SOURCE=sqlite`, DB-Pfad per `DB_PATH`
- Write-Beweis bestanden: Item anlegen, Server neu starten, Item noch vorhanden
- Playlist-Insert ebenfalls getestet und funktioniert
- `.mldb` Dateien in `.gitignore`, nie ins Repo

**Offene TODOs in sqlRepository.js:**
- `getItemHistory()` gibt leeres Array zurück (`playlistlog` noch nicht angebunden)
- `writeHour()` macht DELETE+INSERT der ganzen Stunde statt gezielter Position-Shifts
- `cover` und `containerType` bleiben `null` (`xmldata`/`options` noch nicht geparst)
- Noch offen aus FIELD-SEMANTICS.md: `items.color` Format, `items.endtype` Werte, `playlist.xmldata` Override-Format, `item_cuedata.xmldata` für Hüllkurven

---

## 📚 Bibliothek

### Library Tree (linke Navigation)

Der echte Client hat sieben Wurzelknoten, wir haben bisher nur einen:

| Knoten | Funktion | Status |
|---|---|---|
| Folders | virtuelle Ordner mit Unterordnern | ✅ |
| Artists | auto-generierte Liste aller Interpreten, Klick filtert | ✅ |
| Types | Filter nach Item-Typ | ✅ |
| Attributes | alle Attribut-Keys, aufklappbar zu Werten, Klick filtert nach Key+Wert | ✅ |
| Storages | Filter nach Storage | ✅ |
| Advertising | Schnellfilter Werbung, optional nach Kampagne | 🔽 |
| Everything | komplette Item-Liste | ✅ |

### Suche

| Funktion | Status |
|---|---|
| Einfache Suche über Titel/Artist/Kommentar | ✅ |
| Umschalter: gesamte Bibliothek vs. nur aktueller Ordner/View | ✅ |
| Suche auf bestimmte Felder einschränken (nur Artist, nur Titel …) | ✅ |
| Volltextsuche an/aus (aus = nur Wortanfang, nutzt SQL-Indizes, schneller) | ✅ |
| Advanced Search: mehrere Begriffe UND-verknüpft über alle Felder | ⬜ |

### Item-Liste

| Funktion | Status |
|---|---|
| Spalten, Sortierung, Mehrfachauswahl | ✅ |
| Minutenanzeige der Länge | ✅ |
| Konfigurierbare Spalten: umsortieren, ein-/ausblenden, Standard-Attribute als eigene Spalten | ⬜ |
| Refresh (F5 im Original) | ✅ |

### Ordner und Items verwalten

| Funktion | Status |
|---|---|
| Neues Element anlegen (alle Typen) | ✅ |
| Element bearbeiten, löschen | ✅ |
| Virtuelle Ordner anlegen, umbenennen, verschieben, löschen | ✅ |
| Items zwischen Ordnern verschieben | ✅ (Drag and Drop) |
| Ordner in Ordner verschieben per Drag and Drop, mit Zirkularitätsprüfung | ✅ |
| Dummy → File: Audio für Dummy-Item nachträglich hochladen | ❌ nicht geplant |
| File → Dummy: Audiodatei entfernen, Metadaten bleiben | ❌ nicht geplant |
| Replace audio file: Datei tauschen, Metadaten bleiben | ❌ nicht geplant |

---

## 🧱 Element-Typen

mAirList kennt technisch eine feste Basis-Typliste. Feingliederung (z.B. Dropper vs. Station ID vs. Promo) erfolgt über Ordner und Attribute, nicht über eigene Typen.

| Typ | Beschreibung | Status |
|---|---|---|
| Music | Regulärer Musiktitel | ✅ |
| Jingle | Kurze Kennung, Soundeffekt (auch Dropper, Station ID, Promo, Trailer) | ✅ |
| Advertising | Werbespot, kommerzieller Einschub | ✅ |
| News | Nachrichtenbeitrag, Nachrichten-Enhancer | ⬜ |
| Weather | Wetterbericht, Wetterbett | ⬜ |
| Traffic | Verkehrsmeldung | ⬜ |
| Moderation | Gesprochener Beitrag, Voice Track | ⬜ |
| Bed | Bett, Unterlegmusik für Wortbeiträge | ⬜ |
| Stream | Live-Stream, externe Audio-Quelle (z.B. Webradio-Zuspielung) | ⬜ |
| Container (Hook) | zufälliger Hook aus einem Pool | ✅ |
| Container (Regio) | regionale Auseinanderschaltung | ✅ |
| Container (Nachrichten) | lädt zur vollen Stunde die News | ✅ |
| Container (generisch) | sonstiger dynamischer Container | ✅ |
| Dummy | Platzhalter, nicht abspielbar, kann Text/Notizen enthalten | ⬜ |
| Silence | Stille, definierte Pause | ⬜ |

---

## 🎚️ Item Editor

| Tab | Status |
|---|---|
| Allgemein (Titel, Interpret, Typ, Länge, IDs, Kommentar, Farbe, Cover) | ✅ |
| Wiedergabe (Gain, Normalisieren als Mock, Segue-Modus) | ✅ |
| Attribute (vordefinierte Felder: Text kurz/lang, Zahl, Checkbox, Auswahl, Mehrfachauswahl) | ✅ |
| Sendeplanung (Fix-Zeiten, Rotations-Regeln) | ⬜ |
| Verlauf (wann lief das Item) | ✅ |
| Cue Editor | ✅ siehe unten |

### Cue Editor

| Funktion | Status |
|---|---|
| Alle 17 Cue-Punkte als Karten | ✅ |
| Marker in der Waveform: farbig, mit Label, an korrekter Zeitposition, live-update | ✅ |
| Zoom mit korrekt mitwandernden Markern | ✅ |
| Sortierung nach Wichtigkeit (`DEFAULT_CUE_PRIORITY`), vorbereitet für Benutzereinstellung | ✅ |
| Visuelle Trennung wichtige/weitere Marker | ✅ |
| Echte Audio-Wiedergabe und echte Waveform aus der Audiodatei (wavesurfer.js, Audio-Streaming via HTTP, Range-Request Support, Fallback auf synthetische Waveform) | ✅ |
| Konfigurierbare Cue-Priorität (`DEFAULT_CUE_PRIORITY`), vorbereitet für Benutzereinstellungen | ✅ |
| Auto Cue: Cue In / Fade Out / Cue Out automatisch aus Audiopegel schätzen | ⬜ |

---

## 📥 Import und Storage

| Funktion | Status |
|---|---|
| Datei-Upload über den Browser, Item wird angelegt | ✅ |
| Import-Optionen: Zielordner wählen, Typ setzen, Auto Cue deaktivierbar, Ordnerstruktur übernehmen | ⬜ |
| Storages anlegen, bearbeiten, entfernen (Name + Speicherort) | ⬜ |
| Synchronisation: Storage scannen, neue Dateien links / fehlende rechts | ❌ nicht geplant |
| Umbenannte Dateien reparieren: Join Selected Entries, Auto Repair | ❌ nicht geplant |
| Hinweis aus der Doku: Dateien nach Import nie umbenennen/verschieben, mAirList speichert Storage-ID + relativen Pfad | 📌 Regel, gilt auch für uns |
| Audio-Streaming via HTTP: `GET /api/items/:id/audio` mit Range-Request Support (206 Partial Content), `AUDIO_BASE_DIR` Umgebungsvariable für lokale Entwicklung | ✅ |

---

## 🔀 Playlist und Sendeplan

| Funktion | Status |
|---|---|
| Stundenbasierte Playlists: Kalender → Stunde → Einträge | ✅ |
| mAirList Layout: Toolbar, Tabelle, Datenbanksuche unten | ✅ |
| Alle 24 Stunden sichtbar, auch leere; Einfügen in leere Stunde | ✅ |
| Einfügen, Löschen, Drag-and-Drop-Umsortierung mit Startzeit-Neuberechnung | ✅ |
| Doppelklick öffnet Item Editor, Kontextmenü | ✅ |
| **Lokal vs. global:** Änderungen aus der Playlist sind flüchtige Overrides nur für diese Stunde, expliziter Button schreibt in die DB (wie im Original: "volatile") | ✅ |
| Kontextmenü pro Eintrag: Nach oben, Nach unten, Bearbeiten, Löschen | ✅ |
| Strg+Klick Mehrfachauswahl für Mix Editor Aufruf | ✅ |
| Playlist-Overrides: Änderungen aus dem Mix Editor und Item Editor werden als volatile Overrides pro Playlist-Eintrag gespeichert (`xmldata` Feld in der echten DB), getrennt vom globalen Item-Stand | ✅ |
| Fix-Zeiten: Item startet zur festen Uhrzeit | ⬜ |
| Checkpoint: "Prevent auto float around this item" (z.B. volle Stunde) | ⬜ |
| Konflikt-Erkennung: Warnung wenn zwei Nutzer dieselbe Playlist bearbeiten | ⬜ Phase Mehrbenutzer |
| Playlist-Import aus Dritt-Software (Musicmaster etc.) | ❌ nicht geplant |
| Mehrere Stationen mit getrennten Playlists | 🔽 |

---

## 🎛️ Mix Editor

Der Mix Editor ist im Original sowohl im Playout als auch im DB Client verfügbar. Kernfunktionen laut Doku, Release Notes und Forum:

| Funktion | Status |
|---|---|
| Timeline-Ansicht mehrerer aufeinanderfolgender Playlist-Items | ✅ |
| Aufruf aus der Playlist per Strg+Klick Mehrfachauswahl | ✅ |
| Übergänge verschieben: Song nach links/rechts ziehen ändert StartNext, Clamp auf [cueIn, duration], keine Gaps | ✅ |
| Cue-Punkte direkt in der Timeline anfassen und verschieben | ✅ |
| Fokus-Modus: ±10s um den Übergangspunkt abspielen | ✅ |
| Ergebnis als Playlist-Override oder global in DB speichern | ✅ |
| **Volume-Hüllkurven** (Envelopes): freie Lautstärkekurven pro Item, nicht nur Fade-Punkte | ⬜ bleibt offen |
| Multi-Track Container bearbeiten (frei arrangierte Items) | ❌ nicht geplant |

---

## 🎙️ Voice Tracking

Der VT Recorder ist im Original ein eigenes Fenster im DB Client. Ablauf laut Doku und Forum:

| Funktion | Status |
|---|---|
| VT Recorder: Player A (Ende des vorherigen Elements) und Player B (Anfang des nächsten) hörbar | ⬜ |
| Aufnahme-Sequenz: Preroll → Record → Start Next → End Record | ⬜ |
| Aufnahme im Browser über MediaRecorder API | ⬜ |
| Hüllkurven-Automatik: Musik duckt unter der Stimme (im Original VT PLAYER VOLUME) | ⬜ |
| Ergebnis als Item in die Playlist einbetten, mit korrekten Overlaps | ⬜ |
| Nachbearbeitung im Mix Editor | ⬜ |
| Tastatur-Shortcuts für den ganzen Ablauf | ⬜ |
| VTDJ-Rolle: Nutzer, die nur voicetracken dürfen | ⬜ Phase Mehrbenutzer |

---

## 👥 Mehrbenutzer und Administration

Rollen laut offizieller Doku (Setup):

| Funktion | Status |
|---|---|
| Login mit Benutzername/Passwort | ⬜ |
| Rolle Read-only: nur lesen | ⬜ |
| Rolle Studio: lesen + Verlauf/Logging schreiben | ⬜ |
| Rolle DJ: wie Studio + Playlists ändern und Scheduling, Bibliothek read-only | ⬜ |
| Rolle VTDJ: Voice Tracking | ⬜ |
| Rolle Admin: alles inkl. Konfiguration | ⬜ |
| Benutzer anlegen/bearbeiten, Gruppen | ⬜ |
| Logs einsehen | ⬜ |
| Konflikt-Erkennung bei gleichzeitiger Playlist-Bearbeitung | ⬜ |

---

## 🗓️ Späte Phasen 🔽

| Bereich | Inhalt |
|---|---|
| Mini Scheduler | Stundenvorlagen (Templates), automatische Playlist-Generierung, Vorlagen-Zuweisungen (Standard, "1. Montag im Monat", gerade/ungerade Wochen, Feiertage) |
| Werbung | Kampagnen, Advertising-Planung |

## ❌ Außerhalb des Scopes

| Bereich | Begründung |
|---|---|
| Playout Steuerung | Das ist die Sendesoftware im Studio, nicht der DB Client |
| Reports (Sendeprotokolle, GEMA) | Bewusst weggelassen |
| Storage Redirection (per-Computer Pfade, Cache/Backup-Locations) | Windows-Client-Konzept, im Web-Kontext ohne Funktion |
| Externe Audio-Editoren einbinden | Desktop-Konzept |