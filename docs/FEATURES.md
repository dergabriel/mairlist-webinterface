# ✨ Funktionskatalog

Vollständiger Funktionsumfang des mAirListDB Clients, recherchiert aus der offiziellen Doku (mairlist.docs.mairlist.com), dem alten Wiki (wiki.mairlist.com), den Release Notes und dem Community Forum. Die neue Doku ist teilweise unvollständig (Scheduling und Mix Editor sind dort leere Stubs), diese Lücken wurden aus Wiki, Release Notes und Forum gefüllt.

Legende: ✅ fertig (gegen Mock) · 🚧 in Arbeit · ⬜ offen · 🔽 späte Phase · ❌ außerhalb des Scopes

## 🗺️ Phasen-Status

| Phase | Inhalt | Status |
|---|---|---|
| A | Frontend gegen Mock: Elemente-Liste, Item Editor (alle 6 Tabs), Cue Editor (Marker, Zoom, Prioritätssortierung), Datei-Upload, Playlist im mAirList Layout, leere Stunden, Drag-and-Drop, lokale Overrides vs. DB-Speichern | ✅ vollständig fertig |
| B–E | siehe Bereichs-Tabellen unten (Bibliothek-Feinheiten, Mix Editor, Voice Tracking) | ⬜ offen |
| F | Mehrbenutzer: eigene Benutzerverwaltung mit bcrypt, 5 Rollen, Bootstrap-Admin — siehe Bereichs-Tabelle unten | 🟡 Benutzerverwaltung fertig, Konflikt-Erkennung offen |
| G | Echte Datenbank: `.mldb` (SQLite) statt Mock anbinden | ✅ fertig |
| — | Dritte Datenquelle: mAirListDB Server REST-API statt direktem SQLite-Zugriff (`DATA_SOURCE=api`) — siehe [Bereichs-Tabelle unten](#-api-basierte-datenquelle-mairlistdb-server) | 🟡 Kernfunktionen fertig, einige Funktionen bewusst noch offen |
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

**Read-Paths:**

| Funktion | Status |
|---|---|
| `getFolderTree`, `getFolderById`, `getFolderChildren` | ✅ |
| `getStorages` | ✅ |
| `getItemTypes`, `getArtists`, `getAttributeKeys`, `getAttributeDefinitions` | ✅ |
| `getItems`, `getItemById`, `searchItems` | ✅ |
| `getCuePoints`, `getItemHistory` | ✅ |
| `getPlaylistsByDate`, `getPlaylistById` | ✅ |
| `getUserByUsername`, `getUserById`, `getScopesByUserId`, `getScopesByGroupId` | ✅ |
| `getSessionBySid` | ✅ |

**Write-Paths** (smoke-getestet gegen Kopie `mairlist.test.mldb`, siehe `server/scripts/smoke-writes.js`):

| Funktion | Status |
|---|---|
| `createItem` | ✅ |
| `updateItem` | ✅ |
| `deleteItem` | ✅ |
| `moveItemToFolder` | ✅ |
| `createFolder` | ✅ |
| `renameFolder` | ✅ |
| `moveFolder` | ✅ |
| `deleteFolder` | ✅ |
| `insertPlaylistItem` | ✅ |
| `removePlaylistItem` | ✅ |
| `reorderPlaylist` | ✅ |
| `savePlaylistItemOverrides` | 🟡 nicht smoke-getestet |
| `createSession`, `deleteSession` | 🟡 nicht smoke-getestet |
| `createStorage`, `updateStorage`, `deleteStorage` | 🟡 nicht smoke-getestet |
| `uploadFile` | 🟡 nicht smoke-getestet |

**Offene TODOs in sqlRepository.js:**
- `getItemHistory()` gibt leeres Array zurück; `playlistlog` selbst ist inzwischen über `getLogs()`/`getRecentLogs()` für die Logs-Seite und das Dashboard angebunden
- `writeHour()` macht DELETE+INSERT der ganzen Stunde statt gezielter Position-Shifts
- `cover` und `containerType` bleiben `null` (`xmldata`/`options` noch nicht geparst)
- Noch offen aus FIELD-SEMANTICS.md: `items.color` Format, `items.endtype` Werte, `playlist.xmldata` Override-Format, `item_cuedata.xmldata` für Hüllkurven

---

## 🔌 API-basierte Datenquelle (mAirListDB Server)

Dritte Repository-Implementierung neben Mock und SQLite:
`server/data/apiRepository.js`, aktiviert über `DATA_SOURCE=api`. Statt
die `.mldb`-Datei direkt mit `better-sqlite3` zu öffnen, spricht sie mit
dem mAirListDB Server über dessen REST-API (Port 8840, siehe
[`docs/MAIRLISTDB-API.md`](MAIRLISTDB-API.md)). Löst das
SQLite-Locking-Problem ("database is locked" bei parallel laufendem
mAirList) strukturell, da nicht mehr auf dieselbe Datei zugegriffen
wird.

Konfiguration: `API_DB_BASE_URL`, `API_DB_USER`, `API_DB_PASSWORD`,
`API_DB_STATION` in `.env` (siehe
`server/.env.production.example`). Die Webinterface-eigene
Benutzerverwaltung (`server/data/webAuthDb.js`, bcrypt) ist von
`DATA_SOURCE` unabhängig und funktioniert in allen drei Modi identisch.

Verifiziert mit 19 Smoke-Tests gegen die Produktivinstanz
(`server/scripts/smoke-reads-api.js`, `smoke-writes-api.js`). Der
Kern-Workflow (Ordnerbaum, Items lesen/bearbeiten/speichern,
Audio-Streaming, Playlist lesen/bearbeiten) ist damit produktiv
nutzbar und live gegen die echte mAirList-Installation verifiziert —
inklusive dem strukturellen Wegfall des SQLite-Locking-Konflikts mit
parallel laufendem mAirList.

**Concurrency-Limit gegen "database is locked":** Bei ~12 parallelen
Requests meldete der mAirListDB Server selbst `database is locked` (er
öffnet die `.mldb` intern ebenfalls über SQLite). `apiRepository.js`
drosselt deshalb ausgehende Requests auf `API_DB_MAX_CONCURRENT`
(Default 3, siehe `server/.env.production.example`) statt sie
unbegrenzt parallel abzufeuern.

**Fallstrick — async Stub-Funktion + synchrones `res.json()`:** Route-
Handler in `server/routes/library.js` rufen manche Repository-Funktionen
synchron auf (`res.json(repo.getX())`, ohne `await`), passend zu
`sqlRepository.js`s synchronen Funktionen gleichen Namens. Eine
`async`-Funktion in `apiRepository.js` an dieser Stelle liefert
`res.json()` ein unaufgelöstes Promise, das zu `{}` statt zum
erwarteten Array serialisiert wird (Frontend-Symptom: `[...items]`
schlägt fehl, weil `{}` nicht iterierbar ist). Die `emptyStub()`-Stubs
in `apiRepository.js` sind deshalb bewusst synchron.

**Verfügbar:**

| Funktion | Status |
|---|---|
| `getCapabilities`, `getPermissions` | ✅ |
| `getFolders` (flache Liste) | ✅ |
| `getFolderTree` (aus `getFolders()` clientseitig verschachtelt aufgebaut) | ✅ |
| `getItemsByFolder`, `getItemById`, `getItemsByIds` | ✅ |
| `getItemFolders`, `getItemRestrictions`, `getItemHistory` | ✅ |
| `getPlaylistHour`, `getPlaylistAttributes`, `getPlaylistsByDate`, `getPlaylistById` | ✅ |
| `writeHour` (Playlist-Stunde speichern, volle Ersetzung) | ✅ |
| `getArtists`, `getTitles` (Distinct-Listen) | ✅ |
| `getAudioStreamUrl`, `getAudioStream` (Audio-Proxy, Original + low-quality; Zugangsdaten bleiben serverseitig, landen nie im Frontend) | ✅ |
| `updateItem` (Items inkl. Cue-Punkte, Gain, Attribute speichern) | ✅ |
| `getFolderById`, `getFolderChildren` (aus `getFolders()` clientseitig gefiltert) | ✅ |
| `getItems` (nur mit `folderId`, siehe unten) | ✅ |
| `reorderPlaylist`, `insertPlaylistItem`, `removePlaylistItem` (Read-Modify-Write auf den rohen `Items[]`, siehe unten) | ✅ |
| `savePlaylistItemOverrides` | 🟡 nur Cue-Marker (`Markers`), andere Override-Arten werden mangels bekanntem Zielfeld verworfen |
| `getConfig` (`/api/v1/config`) | ✅ |
| `getAttributeKeys` (aus `getConfig()`s `StandardAttributes`-XML, siehe unten) | ✅ |
| `getDashboardStats`, `getTodayPlaylist` (siehe unten) | 🟡 Dashboard lädt, `totalItems`/`totalStorages` bleiben `null` |
| `getStorages` (`/api/v1/storages`, siehe unten) | ✅ verifiziert, Endpunkt existiert (live getestet: 2 Storages) |

**Playlist-Schreiboperationen — Read-Modify-Write auf rohen Einträgen:**
Die API kennt nur Lesen/Schreiben der kompletten Stunde (kein
Endpunkt für Einfügen/Entfernen/Umsortieren einzelner Slots). `reorderPlaylist`,
`insertPlaylistItem` und `removePlaylistItem` lesen deshalb erst die
rohen, unveränderten `Items[]`-Einträge der Stunde (`getPlaylistHour`),
mutieren das Array in-memory und schreiben es komplett zurück
(`writeHour`). Wichtig: Es wird auf den **rohen** API-Einträgen
gearbeitet, nicht auf einer internen `{time, item}`-Repräsentation —
Dummy-Einträge (`Class:"Dummy"`, z. B. "PH Stundenanfang") haben keine
`DatabaseID`, dafür aber Felder wie `Timing`/`State`/`Customized`/
`FixTimeFrame`/`FixTime`, die eine interne Item-Repräsentation nicht
abbilden kann. Nur neu eingefügte Einträge werden frisch aus dem
internen Item-Objekt gebaut, alles andere läuft unverändert durch.
`savePlaylistItemOverrides` mergt Cue-Overrides direkt in das
`Markers`-Feld des rohen Eintrags (das einzige bekannte, sicher
round-trip-fähige Pro-Slot-Feld); andere Override-Arten haben kein
bekanntes Zielfeld in der API und werden verworfen statt geraten.

**Einschränkung — Container-Items (Werbeblöcke) in `getPlaylistById`:**
Playlist-Einträge vom API-Typ `Class: "Container"` (z. B. Werbeblöcke
mit verschachtelten Items, siehe `docs/MAIRLISTDB-API.md`) werden als
ein einzelner Playlist-Eintrag angezeigt; ihre verschachtelte
`Items`-Liste wird von `apiRepository.js` (noch) nicht aufgeklappt —
Sub-Items eines Werbeblocks sind im api-Modus also sichtbar als ein
Container-Eintrag, aber nicht einzeln aufklapp- oder bearbeitbar. Ein
Container ohne eigene Sub-Items führt zu keinem Fehler, sondern zeigt
schlicht keine Sub-Items an.

**Bewusst leer statt Fehler** (`getItemTypes`, `getLogs`,
`getRecentLogs`): Diese Funktionen liefern im
api-Modus ein leeres Array statt eines Fehlers. Grund: Das Frontend
(`Playlist.jsx`, `DatabaseManager.jsx`) lädt den Ordnerbaum zusammen mit
solchen Listen in einem gemeinsamen `Promise.all` — würde auch nur eine
davon werfen, schlägt der gesamte Batch fehl und die Sidebar zeigt "Baum
nicht verfügbar", obwohl `/api/tree` selbst erfolgreich war. Ein leeres
Array lässt die UI laden; es gibt für `getItemTypes`/`getLogs`/
`getRecentLogs` (noch) keinen entsprechenden Single-Shot-Endpunkt in der
mAirListDB Server API (siehe `docs/MAIRLISTDB-API.md`). `getItems`
liefert ebenfalls `[]`, allerdings nur wenn keine `folderId` übergeben
wird (siehe unten) — mit `folderId` liefert es echte Daten. Jede dieser
Funktionen loggt beim ersten Aufruf seit Serverstart einmalig eine
`console.warn`-Zeile, damit der leere Zustand im Server-Log sichtbar
bleibt, ohne bei jedem Request zu spammen.

**`getAttributeKeys` — aus dem Config-Schema, nicht aus Item-Daten:**
Anders als `sqlRepository.js` (das die tatsächlich beobachteten
Attribut-Werte aus den Items aggregiert) liest `apiRepository.js`s
`getAttributeKeys()` das Attribut-**Schema** aus `/api/v1/config`s
`StandardAttributes`-XML-Feld (siehe `docs/MAIRLISTDB-API.md`). `values`
ist deshalb nur für `Kind="DropDown"`/`"Check"`-Attribute gefüllt
(deren erlaubte Werte im Schema stehen); Freitext-Attribute liefern
`values: []`, auch wenn im Bestand bereits Werte dafür existieren. Das
Parsing nutzt einen gezielten regulären Ausdruck statt eines
XML-Parsers (keine XML-Dependency im Projekt, Format eng umrissen).

**`getStorages` — verifiziert:** `GET /api/v1/storages?station=1`
existiert doch, live gegen die Produktivinstanz getestet (2 Storages),
siehe `docs/MAIRLISTDB-API.md`. Das exakte Response-JSON (Wrapper- vs.
Array-Shape, genaue Feldnamen) ist noch nicht protokolliert;
`getStorages()`/`mapApiStorageToInternal()` mappen defensiv auf
`{ id, name, location }` und decken dabei beide bekannten
API-Konventionen ab (`{value: [...]}` wie bei `/folders`, oder ein rohes
Array wie bei `/items`).

**`getDashboardStats`/`getTodayPlaylist`:** `getTodayPlaylist()` ist
voll funktionsfähig (baut auf den bereits verifizierten
`getPlaylistsByDate`/`getPlaylistById` auf). `getDashboardStats()`
liefert echte Werte für `totalFolders` (aus `getFolders().length`) und
`totalUsers` (aus der von `DATA_SOURCE` unabhängigen `webAuthDb`);
`totalItems`/`totalStorages` bleiben `null`, da die API keinen
Gesamtzähler ohne Scan aller ~155 Ordner liefert — das Dashboard sollte
für `null`-Werte "-" anzeigen statt zu crashen.

**`getItems(filters)` — nur mit `folderId`:** Die API hat keinen
Endpunkt für eine ungefilterte Item-Liste über die gesamte Bibliothek
(`GET /api/v1/items` verlangt immer `folder=<id>` oder `ids=<id,...>`,
siehe `docs/MAIRLISTDB-API.md`). `apiRepository.js`s `getItems` liefert
deshalb nur mit `folderId` echte Daten (baut auf `getItemsByFolder` auf,
`type`/`artist`/`storageId`/`attributeKey`+`attributeValue` werden
clientseitig nachgefiltert); ohne `folderId` liefert es `[]`.

**Bewusst noch nicht implementiert** (werfen einen klaren "im
api-Modus noch nicht verfügbar"-Fehler statt zu crashen oder falsche
Daten zu liefern):

| Funktion / Bereich | Status |
|---|---|
| `createItem`, `deleteItem` | ⬜ Endpunkt nicht verifiziert |
| Ordner-CRUD: `createFolder`, `renameFolder`, `moveFolder`, `deleteFolder` | ⬜ |
| Storage-Verwaltung: `createStorage`, `updateStorage`, `deleteStorage` | ⬜ |
| Item-Suche (`searchItems`), `getAttributeDefinitions`, `getCuePoints` | ⬜ |
| `moveItemToFolder`, `uploadFile`, `resolveAudioPath` | ⬜ |
| `getItemTypes` | ⬜ kein Endpunkt gefunden, bleibt leerer Stub (siehe oben) |
| `getLogs`, `getRecentLogs` | ⬜ kein Logs-Endpunkt gefunden, liefern `[]` statt Fehler (siehe oben) |

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

mAirList kennt technisch eine feste Basis-Typliste. Feingliederung (z.B. Dropper vs. Station ID vs. Promo) erfolgt über Ordner und Attribute, nicht über eigene Typen. Im Frontend werden die Typen dynamisch aus der DB geladen (`getItemTypes`), nicht mehr hardcoded.

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
| Waveform/Marker-Sync: Marker/Zeitachse und wavesurfer nutzen dieselbe echte Audiodauer (`audioDuration` state), Overlay (Marker, Hook/Fade/Loop-Bänder, Ticks) folgt wavesurfers Scroll-Position beim Zoomen, Klick-zum-Springen nutzt wavesurfers eigenes Koordinatensystem | ✅ |
| Zoom-Verhalten: kein Auto-Zoom mehr beim Abspielen, Minimum-Zoom zeigt immer die komplette Waveform (fit to width) | ✅ |
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
| Mehrere Stationen mit mehreren Playlists pro Station | 🔽 |

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

**Eigene Benutzerverwaltung, unabhängig von mAirList:** mAirLists eigene
`auth.db` wird nicht mehr genutzt — Login dort ist deaktiviert
(`ManagementLogin=off`), da Daten nicht zuverlässig persistiert wurden und
das MD5-Hash-Schema nicht verifizierbar war. Stattdessen eigene,
unabhängige SQLite-DB `server/webinterface-auth.db`
(`server/data/webAuthDb.js`) mit `bcrypt`-Hashing statt MD5. Beim ersten
Start wird automatisch ein Bootstrap-Admin angelegt (Passwort im
Server-Log oder via `INITIAL_ADMIN_PASSWORD` env var). Das
Gruppen-Feature wurde entfernt — die fünf Rollen ersetzen dieses Konzept.

| Funktion | Status | Notiz |
|---|---|---|
| Login mit Benutzername/Passwort | ✅ | HTTP-only Session-Cookie, `server/routes/auth.js`, gegen eigene `webinterface-auth.db` |
| Bootstrap-Admin beim ersten Start | ✅ | `server/data/webAuthDb.js`, Passwort im Log oder via `INITIAL_ADMIN_PASSWORD` |
| Rollen (readonly/studio/dj/vtdj/admin) | ✅ | Fest definiert in `server/data/webAuthDb.js`, Scope-Mapping über `ROLE_SCOPES` |
| Rolle Read-only: nur lesen | ✅ | |
| Rolle Studio: lesen + Verlauf/Logging schreiben | ✅ | |
| Rolle DJ: wie Studio + Playlists ändern und Scheduling, Bibliothek read-only | ✅ | |
| Rolle VTDJ: Voice Tracking | ✅ | Rolle vorhanden, Voice-Tracking-Feature selbst noch offen (Phase E) |
| Rolle Admin: alles inkl. Konfiguration | ✅ | |
| Benutzer anlegen/bearbeiten | ✅ | Administration-Bereich, nur für Admin-User sichtbar (`isAdmin`-Check) |
| Gruppen-Verwaltung | ❌ entfernt | Rollen ersetzen das Gruppen-Konzept |
| Logs einsehen | ✅ | Logs-Seite |
| Konflikt-Erkennung bei gleichzeitiger Playlist-Bearbeitung | ⬜ | |

### Administration (Admin-Bereich)

Eigener Bereich in der Sidebar, nur für Admin-User sichtbar (`isAdmin`-Check).

| Funktion | Status |
|---|---|
| **Benutzer-Verwaltung** (`frontend/src/pages/admin/Users.jsx`): anlegen, bearbeiten, löschen | ✅ |
| Passwort ändern (bcrypt-Hashing) | ✅ |
| Rolle je Benutzer setzen (readonly/studio/dj/vtdj/admin) | ✅ |
| API-Token generieren und kopieren | ✅ |
| **Logs-Seite** (`frontend/src/pages/Logs.jsx`): `playlistlog` aus der DB | ✅ |
| Datumsfilter | ✅ |
| Pagination | ✅ |

---

## ⚙️ Einstellungen

Panel-Settings über `frontend/src/pages/Settings.jsx`, persistiert in `server/settings.json` (`server/lib/settings.js`).

| Abschnitt | Status |
|---|---|
| Allgemein (Stationsname, Datumsformat, Zeitformat, Standard-Datum) | ✅ |
| Anzeige (Items pro Seite) | ✅ |
| Pfade (Audio-Basisverzeichnis, Upload-Basisverzeichnis) | ✅ |
| Sicherheit (Allowed Origins) | ✅ |

---

## 🏠 Dashboard / Startseite

`frontend/src/pages/Dashboard.jsx`, erste Seite nach Login.

| Funktion | Status |
|---|---|
| Statistik-Kacheln: Items, Storages, Ordner, Benutzer | ✅ |
| Heutige Playlist | ✅ |
| Letzte Wiedergaben | ✅ |
| Systemstatus: Data Source, Server, aktueller Benutzer/Rolle | ✅ |

---

## 🔀 Multi-Station & Multi-Playlist

**Ziel:** Mehrere Stationen pro Datenbank verwalten, mit Umschalter im UI,
sowie mehrere Playlisten pro Station (über das mAirList-Original hinausgehend).

### Konzept (angelehnt an mAirList Multi-Station Scheduling)
- Stationen teilen sich: Audio-Bibliothek, Storages, Hour/Music-Templates
- Getrennt pro Station: Playlisten, Template-Zuweisung, Advertising-Settings
- Jede Station kann mehrere Playlisten haben (Hauptplaylist + beliebig viele weitere),
  z.B. für Subsender oder parallele Ausspielwege

### Geplante Funktionen
- [ ] Schema-Check: Station-Tabelle/Spalten in echter .mldb prüfen (PRAGMA table_info)
- [ ] Standard-Station in den Einstellungen festlegbar
- [ ] Station-Switcher im UI (Sidebar/Header)
- [ ] Mehrere Playlisten pro Station verwaltbar (anlegen, umbenennen, löschen)
- [ ] Repository-Layer: Station-Filter für Playlist, Logs, Dashboard
- [ ] AppDataContext: Caching pro Station statt global

### Status
🔽 Nicht Teil von Phase I, spätere Phase (noch zu benennen)

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