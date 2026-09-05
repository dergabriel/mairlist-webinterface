# 🌐 MAIRLISTDB-API.md

# mAirListDB Server – REST API (reverse-engineered)

Diese Dokumentation basiert auf beobachtetem HTTP-Traffic des offiziellen
mAirList-Clients (Version 6.3.24.4498) gegen den `mAirListDB Server` (Port 8840,
`ServerMode=HTTP`, laut `dbserver.ini`). Sie ist **nicht offiziell** und
unvollständig – es sind nur die Endpunkte dokumentiert, die im Traffic
tatsächlich beobachtet wurden. Response-Formate sind anhand echter Antworten
protokolliert, PUT-Bodies wurden (Stand dieser Dokumentation) noch nicht
verifiziert und sind als Annahme markiert.

**Implementiert in:** [`server/data/apiRepository.js`](../server/data/apiRepository.js)
(`DATA_SOURCE=api`) — die Repository-Funktionen setzen exakt die hier
dokumentierten Endpunkte um. Funktionsumfang und aktueller Stand (was
verfügbar ist, was bewusst als "noch nicht verfügbar" abgefangen wird):
siehe [`docs/FEATURES.md` – API-basierte Datenquelle](FEATURES.md#-api-basierte-datenquelle-mairlistdb-server).

## Grundlagen

- **Base URL:** `http://<server>:8840`
- **Auth:** HTTP Basic Authentication, Zugangsdaten identisch mit den
  mAirList-Benutzerkonten (`auth_users` in der jeweiligen Instanz-`auth.db`)
- **Format:** JSON, PascalCase-Feldnamen (spiegelt die Delphi/Pascal-Herkunft
  von mAirList wider)
- **Query-Parameter `station`:** scheint bei den meisten Endpunkten
  erforderlich bzw. wird vom Client immer mitgeschickt (`station=1`)
- **Pfad-Encoding:** Dateinamen in URLs sind URL-encoded (z. B. Leerzeichen
  als `%20`, eckige Klammern als `%5B`/`%5D`)
- **Concurrency-Limit nötig:** Der mAirListDB Server öffnet die `.mldb`
  intern selbst über SQLite. Bei ~12 parallelen Requests von unserem
  Client meldete der Server `database is locked` — dieselbe Fehlerklasse,
  die `DATA_SOURCE=api` eigentlich vermeiden soll, nur serverseitig
  ausgelöst statt clientseitig. `apiRepository.js` drosselt deshalb
  ausgehende Requests auf `API_DB_MAX_CONCURRENT` (Default 3, siehe
  `server/.env.production.example`) statt sie unbegrenzt parallel
  abzufeuern.

## Server-Metadaten

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/capabilities` | Liste aktivierter Server-Features, z. B. `EditItems`, `CreateItems`, `EditPlaylist`, `EditFolders`, `EditStorages`, `EditStations`, `EditSubplaylists`, `FolderConfig`, `AssignFolders`, `MultiFolders`, `MiniScheduler`, `AdScheduler`, `PlaylistAttributes` |
| GET | `/api/v1/permissions` | Berechtigungen des eingeloggten Users (siehe unten) |
| GET | `/api/v1/config?station=1` | Server-/Stations-Konfiguration (siehe unten, VERIFIZIERT) |
| GET | `/api/v1/config/<key>?station=1` | Einzelner Konfigurationswert |
| GET | `/api/v1/stations/<id>/config/<key>?station=1` | Stations-spezifischer Konfigurationswert |

### Response: `/api/v1/permissions`

```json
{
  "UserLevel": "Admin",
  "LibraryPermissions": "All",
  "Enabled": "on",
  "SubPlaylists": "",
  "Stations": "",
  "GeneralPermissions": "All",
  "Type": "TDBPermissions",
  "Class": "TDBPermissions"
}
```

### Response: `/api/v1/config?station=1` – VERIFIZIERT

```json
{
  "MaxPenalty": "2",
  "ArtistGroups": "[]",
  "ImportItemType": "Unknown",
  "ImportTranscodeSettingsFileExtension": "",
  "ImportTranscodeCondition": "Always",
  "ImportTranscodeSettingsAudioFormat": "MP3",
  "ImportTranscodeSettingsMimeType": "",
  "TrackSeparationPenalty": "2",
  "ImportTranscodeSettingsBitrate": "320",
  "TrackSeparation": "3",
  "PlaylistAttributes": "<StandardAttributes/>",
  "ImportStorageSubfolder": "",
  "TitleSeparationPenalty": "2",
  "ArchivedFilenamesAttribute": "",
  "ImportStorage": "1",
  "schemaversion": "24",
  "ImportTranscodeSettingsEncoderOptions": "",
  "ImportTranscodeSettingsMode": "Stereo",
  "TitleSeparation": "3",
  "WeekReference": "2017-01-02",
  "ImportImportTasks": "All",
  "StandardAttributes": "<StandardAttributes>...</StandardAttributes>",
  "Dummy": "off",
  "dbid": "{C7861752-3801-44FD-939C-4B56DDDA661B}",
  "ArtistSeparation": "2",
  "ImportOverwritePolicy": "Rename",
  "MasterPlaylistTargetDuration": "3600",
  "AutoCreateErrorItem": "off",
  "ArtistSeparationPenalty": "1",
  "AutoCreateErrorItemFolder": ""
}
```

**Anmerkungen:**
- Flaches Key-Value-Objekt, ALLE Werte als String (auch numerisch
  aussehende wie `"MaxPenalty": "2"` oder `"schemaversion": "24"`)
- `dbid`: eindeutige GUID der Datenbank, identisch mit der
  `DatabaseID`/Registry-Zeichenkette aus `dbserver.ini`
  (`{C7861752-3801-44FD-939C-4B56DDDA661B}`)
- **`StandardAttributes` – sehr wichtig für den Umbau:** enthält XML
  (als String innerhalb des JSON) und definiert das **Schema** für die
  `Attributes` jedes Items. Entschlüsselt:
  ```xml
  <StandardAttributes>
    <StandardAttribute Name="Jahr"/>
    <StandardAttribute Name="Album"/>
    <StandardAttribute Name="Track"/>
    <StandardAttribute Name="Genre" Kind="DropDown"/>
    <StandardAttribute Name="Komponist"/>
    <StandardAttribute Name="Label" Kind="DropDown"/>
    <StandardAttribute Name="Labelcode" Kind="DropDown"/>
    <StandardAttribute Name="ISRC"/>
    <StandardAttribute Name="Sprache" Kind="DropDown"/>
    <StandardAttribute Name="Stimmung" Kind="DropDown">
      <Values>
        <Value>Low</Value>
        <Value>Medium</Value>
        <Value>High</Value>
      </Values>
    </StandardAttribute>
    <StandardAttribute Name="Branding" Kind="DropDown">
      <Values>
        <Value>Ja</Value>
        <Value>Nein</Value>
      </Values>
    </StandardAttribute>
    <StandardAttribute Name="Opener" Kind="Check">
      <Values>
        <Value>Ja</Value>
      </Values>
    </StandardAttribute>
  </StandardAttributes>
  ```
  Das erklärt den bei Item 2605 beobachteten Wert `"Stimmung": "High"` –
  `Stimmung` ist ein Dropdown-Attribut mit genau den drei Werten
  Low/Medium/High. Für ein Attribute-Editor-UI im Webinterface muss
  dieses XML geparst werden, um zu wissen welche Attribute-Felder
  existieren und welcher Typ/welche Dropdown-Werte pro Feld gültig sind
  (freier Text vs. `Kind="DropDown"` vs. `Kind="Check"`)
- `PlaylistAttributes` ist ebenfalls XML, hier aber leer
  (`<StandardAttributes/>`) – vermutlich das gleiche Konzept für
  playlist-spezifische Attribute, aktuell ungenutzt in diesem Bestand
- Weitere Felder betreffen Scheduler-Regeln (`ArtistSeparation`,
  `TitleSeparation`, `TrackSeparation` + jeweilige `*Penalty`-Werte),
  Import-Verhalten (`Import*`-Felder) und allgemeine Server-Konfiguration

## Folders (Ordnerbaum)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/folders?station=1` | **VERIFIZIERT:** liefert den KOMPLETTEN Ordnerbaum auf einmal, nicht nur die Root-Ebene (getestet: 155 Ordner in einer einzigen Antwort) |
| GET | `/api/v1/folders?parent=<id>&station=1` | Unterordner eines bestimmten Ordners (gefiltert) |
| GET | `/api/v1/folders/<id>/config?station=1` | Ordner-spezifische Konfiguration |
| POST | `/api/v1/folders?station=1` | **VERIFIZIERT:** Ordner anlegen |
| PUT | `/api/v1/folders/<id>?station=1` | **VERIFIZIERT:** Ordner umbenennen und/oder verschieben |
| DELETE | `/api/v1/folders/<id>?station=1` | **VERIFIZIERT:** Ordner löschen |

### Response: `/api/v1/folders?station=1` – VERIFIZIERT

Response ist in ein Wrapper-Objekt eingebettet, nicht direkt ein Array:

```json
{
  "value": [
    {
      "SubfolderCount": 0,
      "Parent": "5",
      "ID": "50",
      "Name": "0-Divers"
    },
    {
      "SubfolderCount": 3,
      "Parent": "root",
      "ID": "1",
      "Name": "Musik"
    }
  ],
  "Count": 155
}
```

**Anmerkungen:**
- `value` enthält den kompletten Baum als flache Liste (alle Ebenen
  gemischt), Hierarchie ergibt sich aus `Parent` → `ID`-Verkettung
- Top-Level-Ordner haben `Parent: "root"` (String, kein null)
- `Count` ist die Gesamtzahl aller Ordner in der Antwort – bei 155
  Ordnern kam alles in einer einzigen Response, **kein Hinweis auf
  Pagination** wurde beobachtet (keine `nextPage`/`offset`-Felder o. ä.)
- Alle Felder als String, auch `ID`/`Parent`/`SubfolderCount` obwohl
  numerisch aussehend – konsistent mit `DatabaseID` bei Items
- Für den Ordnerbaum im Frontend reicht vermutlich EIN Request beim
  Start (kompletter Baum), Lazy-Loading via `parent=<id>` ist optional
  möglich aber angesichts der überschaubaren Größe (155 Ordner bei
  diesem Bestand) nicht zwingend nötig

### POST `/api/v1/folders?station=1` – VERIFIZIERT

Legt einen neuen Ordner an.

**Request-Body:**
```json
{ "Name": "Mein Ordner", "Parent": "5" }
```

**Response bei Erfolg (Status 200):** das neu erzeugte Objekt inkl. `ID`:
```json
{ "Parent": "5", "ID": "312", "Name": "Mein Ordner" }
```

- Top-Level-Ordner: `Parent: "root"` (String, wie bei GET `/folders`)
- `ID` wird vom Server vergeben und kommt nur über diese Response zurück

### PUT `/api/v1/folders/<id>?station=1` – VERIFIZIERT

Dient sowohl zum Umbenennen (nur `Name` ändert sich) als auch zum
Verschieben (nur `Parent` ändert sich) — ein Endpunkt für beides, es wird
immer der komplette Body mit beiden Feldern gesendet.

**Request-Body:**
```json
{ "Name": "Neuer Name", "Parent": "5" }
```

- **Content-Type:** `application/json`
- **Response bei Erfolg:** `null` (leerer Body, Status 200) — wie bei
  `PUT /api/v1/items/<id>`, kein Echo des aktualisierten Objekts
- Top-Level-Ziel: `Parent: "root"`

### DELETE `/api/v1/folders/<id>?station=1` – VERIFIZIERT

- **Response bei Erfolg:** `null` (leerer Body, Status 200)
- Verhalten bei nicht-leeren Ordnern (Unterordner/Items vorhanden) nicht
  verifiziert — im Zweifel vor dem Löschen prüfen

## Items (Library)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/items?folder=<id>&station=1` | Items in einem Ordner |
| GET | `/api/v1/items/<id>?station=1` | Einzelnes Item, vollständig |
| GET | `/api/v1/items?ids=<id>[,<id>...]&icons=true&station=1` | Mehrere Items gezielt per ID, inkl. Icons |
| GET | `/api/v1/items?artists&time=...&station=1` | Distinct-Liste der Artists (Such-/Filter-Funktion) |
| GET | `/api/v1/items?titles&time=...&station=1` | Distinct-Liste der Titel |
| GET | `/api/v1/items?folder=<id>&time=...&station=1` | Items mit Sendezeit-Kontext (z. B. für Scheduling-Anzeige) |
| GET | `/api/v1/items?folder=<id>&id=<id>&station=1` | Gezielte Abfrage eines Items innerhalb eines Ordnerkontexts (beobachtet direkt nach einem PUT, vermutlich zur Bestätigung/Refresh) |
| GET | `/api/v1/items/<id>/folders?station=1` | Ordner-Zuordnungen eines Items |
| GET | `/api/v1/items/<id>/restrictions?station=1` | Restriktionen (Campaigns/Sperren) eines Items |
| GET | `/api/v1/items/<id>/history?station=1` | Abspielhistorie eines Items |
| PUT | `/api/v1/items/<id>` | Item aktualisieren (Body-Format: Annahme, siehe unten) |

### Response: `/api/v1/items/<id>?station=1`

```json
{
  "Artist": "Perla Nera",
  "Duration": 219.2,
  "Attributes": {
    "Stimmung": "High"
  },
  "Amplification": -10.8350827644041,
  "Levels": {
    "Loudness": -12.1649172355959,
    "TruePeak": 0.482986986637115,
    "Peak": 0
  },
  "Markers": {
    "FadeOut": 217.589,
    "CueOut": 219.2,
    "StartNext": 217.395
  },
  "DatabaseID": "2605",
  "Title": "Lost in Dreams",
  "Type": "Music",
  "Filename": "/storages/1/files/03 - Perla Nera - Lost in Dreams [Radio Edit].mp3",
  "Class": "File"
}
```

### Response: `/api/v1/items?folder=<id>&station=1` – VERIFIZIERT (erweitert)

Anders als `/api/v1/folders` liefert dieser Endpunkt ein **rohes Array**,
kein `{value, Count}`-Wrapper:

```json
[
  {
    "NextUse": "",
    "Artist": "Hier",
    "Duration": 5.825,
    "Folders": [
      { "ID": "19", "Name": "IDs" },
      { "ID": "33", "Name": "Sweeper" }
    ],
    "Attributes": {
      "Konto": "Adobe Audition 13.0 (Windows)",
      "Datum": "2020-10-17T23:14:25+02:00"
    },
    "Amplification": -10.8787836821338,
    "LastUse": "2026-09-04T05:00:00",
    "Levels": {
      "Loudness": -12.1212163178662,
      "TruePeak": -2.54295110702515,
      "Peak": -2.99994254112244
    },
    "LastPlayed": "2026-09-04T05:07:35",
    "Markers": {
      "FadeOut": 2.514,
      "CueOut": 4.504,
      "StartNext": 1.2
    },
    "DatabaseID": "804",
    "Title": "DXR_Sweeper_HierIst",
    "Type": "Sweeper",
    "Filename": "/storages/1/files/DXR_Sweeper_HierIst.wav",
    "Class": "File",
    "EffectiveDuration": 1.2
  }
]
```

**Neu gegenüber der Einzel-Item-Response (`/items/<id>`):**
- `Folders`: Array aller Ordner-Zuordnungen dieses Items (ID + Name),
  ein Item kann in mehreren Ordnern gleichzeitig gelistet sein
  (hier gleichzeitig in "IDs" und "Sweeper")
- `NextUse` / `LastUse`: geplante bzw. letzte Verwendung laut Scheduler
  (ISO-Timestamp oder leerer String wenn nicht geplant)
- `LastPlayed`: Zeitpunkt der letzten tatsächlichen Wiedergabe
  (ISO-Timestamp)
- `EffectiveDuration`: abweichend von `Duration` – vermutlich die
  tatsächliche Hörzeit unter Berücksichtigung von `StartNext`
  (`EffectiveDuration` liegt bei allen beobachteten Items nahe am
  `StartNext`-Wert, z. B. `StartNext: 1.2` → `EffectiveDuration: 1.2`).
  Das deutet darauf hin, dass `EffectiveDuration` die Zeit bis zum
  Übergangspunkt ist, nicht die volle Dateidauer

Die Einzel-Item-Response (`GET /api/v1/items/<id>`) enthält diese
zusätzlichen Felder NICHT (siehe Beispiel oben) – sie liefert einen
schlankeren Datensatz ohne `Folders`/`NextUse`/`LastUse`/`LastPlayed`/
`EffectiveDuration`.

**Allgemeine Anmerkungen (für beide Response-Varianten):**
- `Markers` enthält nur tatsächlich gesetzte Cue-Punkte, nicht alle
  denkbaren Typen. **Bislang bei ~20 stichprobenartig geprüften Items
  (Musik + Sweeper) nur folgende vier Marker-Typen beobachtet:**
  `CueIn`, `CueOut`, `FadeOut`, `StartNext`. Weder `FadeIn`, `FadeEnd`,
  `Hook`/`HookIn`/`HookOut` noch `Ramp1`/`2`/`3` wurden bisher gesehen –
  möglicherweise nutzt dieser Bestand diese Marker-Typen schlicht nicht,
  oder sie werden anders benannt. Bei Bedarf gezielt ein Item mit
  bekannten Hook-/Ramp-Punkten (z. B. im Cue Editor sichtbar) über die
  API abfragen um das zu klären.
- `Amplification` = Normalisierungs-Gain in dB (entspricht `gainDb` im
  aktuellen Datenmodell)
- `Levels.Loudness` = LUFS-Wert
- `Class` unterscheidet u. a. `"File"` und `"Container"` (siehe Playlists
  unten für ein Container-Beispiel)
- `Attributes` ist nicht auf ein festes Schema beschränkt – beobachtet
  wurden sowohl fachliche Attribute (`"Stimmung": "High"`) als auch
  technische Metadaten (`"Konto"`, `"Datum"` – vermutlich automatisch
  von der Aufnahme-/Schnittsoftware gesetzt, hier "Adobe Audition 13.0")

### PUT `/api/v1/items/<id>` – VERIFIZIERT

Der Body ist **exakt symmetrisch zum GET-Format**: das komplette
Item-Objekt (wie von GET zurückgegeben) wird mit geänderten Werten per
PUT zurückgeschickt. Verifiziert per PowerShell (`Invoke-RestMethod`):
Item gelesen, `Markers.FadeOut` geändert, unverändertes JSON per PUT
gesendet, anschließend per GET bestätigt dass der neue Wert
tatsächlich persistiert wurde.

- **Content-Type:** `application/json`
- **Response bei Erfolg:** `null` (leerer Body, Status 200)
- Es reicht, das komplette vom GET erhaltene Objekt zu nehmen, einzelne
  Felder zu ändern und unverändert zurückzuschicken – keine Teil-Updates
  nötig, kein separates "Diff"-Format

## Storages / Audio-Dateien

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/storages?station=1` | **VERIFIZIERT:** liefert die konfigurierten Storages (live getestet: 2 Storages) |
| GET | `/api/v1/storages/<id>/files/<filename>?quality=default` | Audiodatei, Originalqualität |
| GET | `/api/v1/storages/<id>/files/<filename>?quality=low` | Audiodatei, transkodiert (serverseitiges Transcoding, z. B. für schnelle PFL/Preview-Wiedergabe) |

`<filename>` ist URL-encoded, entspricht dem `Filename`-Feld aus der
Item-Antwort (ohne führendes `/storages/<id>/files/`).

### Response: `/api/v1/storages?station=1` – VERIFIZIERT

Live gegen die Produktivinstanz getestet:

```json
{
  "value": [
    {
      "DefaultLocation": "C:\\Users\\Administrator\\Music",
      "Description": "",
      "ID": "1",
      "Name": "Datenbank",
      "ItemCount": 2230
    },
    {
      "DefaultLocation": "C:\\Users\\Digital X Radio\\Documents\\AUTOMAT",
      "Description": "",
      "ID": "2",
      "Name": "VT Schienen",
      "ItemCount": 1
    }
  ],
  "Count": 2
}
```

**Anmerkungen:**
- Wrapper-Format `{value, Count}` wie bei `/api/v1/folders`, **kein**
  rohes Array
- Felder: `ID`, `Name`, `Description`, `DefaultLocation`, `ItemCount`
- `ItemCount` ist die Anzahl Items in diesem Storage — Summe über alle
  Storages ergibt die Gesamtzahl aller Items (hier: 2230 + 1 = 2231),
  nutzbar als `totalItems` für `getDashboardStats()` ohne alle Ordner
  einzeln abzufragen
- `apiRepository.js`s `mapApiStorageToInternal()` mappt auf
  `{ id, name, location }` (analog zu `sqlRepository.js`s
  `getStorages()`-Shape): `location` kommt aus `DefaultLocation`.
  `Description` und `ItemCount` fließen nicht in die gemappten
  Storage-Objekte ein, `ItemCount` wird aber separat für
  `getDashboardStats()` aufsummiert (siehe unten)

## Playlists

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0?station=1` | Playlist einer Stunde |
| GET | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0/attributes?station=1` | Playlist-Attribute (separat von den Items) |
| PUT | `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0` | Playlist einer Stunde schreiben (Body-Format: Annahme, siehe unten) |

Die `0` im Pfad ist vermutlich ein Playlist-Index (mAirList kennt mehrere
Playlists/Player, hier bisher nur Index `0` beobachtet).

### Response: leere Stunde

```json
{
  "Items": [],
  "VersionInfo": {
    "EditUser": "Digital X Radio",
    "EditTime": "2026-09-03T17:56:33",
    "Version": "2"
  }
}
```

**`VersionInfo.Version` deutet auf optimistisches Locking hin** – beim PUT
muss vermutlich die zuletzt gelesene Version mitgeschickt werden, damit der
Server nebenläufige Änderungen erkennen kann. Noch zu verifizieren.

### Response: gefüllte Stunde – VERIFIZIERT (korrigiert)

**Wichtig, korrigiert gegenüber einer früheren Version dieser Doku:**
Jeder Eintrag in `Items[]` ist **KEIN** `{Class:"Playlist", Time:{...},
Item:{...}}`-Wrapper. Er **IST** das Item selbst, flach — `Title`,
`Artist`, `Duration`, `Class` etc. liegen direkt auf dem Eintrag, es gibt
kein verschachteltes `Item`-Feld. Verifiziert gegen eine echte, gefüllte
Stunde (`GET /api/v1/playlists/2026/09/05/14/0`):

```json
{
  "Items": [
    {
      "FixTime": "14:00:00",
      "ID": "{B29BC114-...}",
      "Title": "PH Stundenanfang",
      "Timing": "Soft",
      "State": "Normal",
      "Class": "Dummy",
      "Customized": true,
      "FixTimeFrame": 100
    },
    {
      "Artist": "OMNIMAR",
      "Duration": 261.082,
      "IconData": "...",
      "DatabaseID": "...",
      "Title": "...",
      "Class": "File",
      "Filename": "/storages/1/files/... oder lokaler Windows-Pfad"
    }
  ],
  "VersionInfo": {
    "EditUser": "...",
    "EditTime": "...",
    "Version": "..."
  }
}
```

**Anmerkungen:**
- `Class` unterscheidet mind. `"Dummy"`, `"File"` und `"Container"`
- `"Dummy"`-Einträge sind Platzhalter (z. B. Stundenanfangs-Marker wie
  `"PH Stundenanfang"`). Sie haben **keine** `DatabaseID` und **keine**
  `Duration` — nur `Title` und, oft, ein explizites `FixTime`
  (`"HH:MM:SS"`, ohne Millisekunden)
- Normale `"File"`-Einträge tragen dagegen i. d. R. **kein** eigenes
  Zeitfeld — ihre tatsächliche Startzeit ergibt sich kumulativ aus der
  Stundenstart-Zeit plus der Summe der `Duration` aller vorangehenden
  Einträge (wie bei `sqlRepository.js`'s `resequenceEntries`)
- Container-Items (`Class: "Container"`, z. B. Werbeblöcke) haben
  vermutlich weiterhin eine eigene `Items`-Liste für ihre Unterelemente
  (noch nicht gegen eine echte Instanz mit Container-Inhalt verifiziert)
- `Filename` kann sowohl auf `/storages/...` (echte Mediendateien) als auch
  auf lokale Windows-Pfade zeigen (z. B. bei Dummy-/Platzhalter-Elementen)

### PUT `/api/v1/playlists/<yyyy>/<mm>/<dd>/<hh>/0` – VERIFIZIERT

Body-Format identisch zum GET: `{ Items: [...], VersionInfo: {...} }`.
Verifiziert per PowerShell: Playliste gelesen, unverändert per PUT
zurückgeschickt.

- **Content-Type:** `application/json`
- **Response bei Erfolg:** JSON-Objekt mit der neuen Versionsnummer,
  z. B. `{ "Version": 4 }` – der Server erhöht `VersionInfo.Version`
  bei jedem erfolgreichen Schreibvorgang und gibt die neue Nummer direkt
  zurück. Das bestätigt das optimistische Locking-Konzept: die Response
  dient als Bestätigung, dass der Schreibvorgang ohne Konflikt
  durchgelaufen ist.
- **Noch offen:** ob beim PUT die zuvor gelesene `VersionInfo.Version`
  mitgeschickt werden MUSS, damit der Server einen Konflikt erkennen
  kann (falls zwischenzeitlich jemand anders geschrieben hat), oder ob
  das rein informativ ist. Für einen echten Konflikttest müsste man
  zwei überlappende Schreibvorgänge simulieren (z. B. mit veralteter
  Version schreiben und schauen ob ein Fehler kommt).

**Einzelne Slots einfügen/entfernen/umsortieren:** Die API bietet dafür
keinen eigenen Endpunkt, nur ganze Stunde lesen/schreiben. `apiRepository.js`
implementiert `reorderPlaylist`/`insertPlaylistItem`/`removePlaylistItem`
deshalb als Read-Modify-Write: aktuelle Stunde per GET holen, die rohen
`Items[]`-Einträge unverändert lassen bis auf die eine Mutation, komplett
per PUT zurückschreiben. Entscheidend dabei: es wird mit den **rohen**
API-Einträgen gearbeitet (nicht mit einer internen Item-Repräsentation),
weil `Class:"Dummy"`-Einträge Felder (`Timing`, `State`, `Customized`,
`FixTimeFrame`, `FixTime`) tragen, die eine interne Repräsentation nicht
verlustfrei abbilden kann — ein Rekonstruktionsversuch würde diese Felder
korrumpieren oder verwerfen.

## Fehlerbehandlung – teilweise VERIFIZIERT

Getestet mit einer nicht existierenden Item-ID
(`GET /api/v1/items/999999?station=1`):

- **HTTP-Status:** `404 Not Found`
- **Body:** `The requested resource was not found.` (Klartext, kein JSON)

Auth-Fehler (aus dem mitmproxy-Test beobachtet, ohne Credentials):
- **HTTP-Status:** `401`
- **Content-Type:** `text/html`

**Noch offen:** Fehlerformat bei ungültigem PUT-Body (z. B. fehlerhaftes
JSON, falscher Datentyp, Versionskonflikt bei Playlists) – noch nicht
getestet.

## Sonstiges (nur URL beobachtet, Response-Format unbekannt)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/subplaylists?station=1` | Sub-Playlists |
| GET | `/api/v1/templates/hour/items?station=1` | Hour-Templates |
| GET | `/api/v1/templates/music/items?station=1` | Music-Templates |
| GET | `/api/v1/templates/transitions/items?station=1` | Transition-Templates |
| GET | `/api/v1/templates/<typ>/assignment/<n>?station=1` | Template-Zuordnung |

### Attribute-Schema statt eigenem Endpunkt

Es gibt **keinen** dedizierten `/api/v1/attributekeys`-o.ä.-Endpunkt. Das
Attribut-Schema (welche Attribut-Namen existieren, Freitext vs. Dropdown vs.
Checkbox, gültige Dropdown-Werte) steckt stattdessen im bereits
dokumentierten `/api/v1/config`-Feld `StandardAttributes` (XML-String, siehe
oben). `apiRepository.js`s `getAttributeKeys()` ruft `getConfig()` auf und
extrahiert die `Name`/`Values`-Angaben daraus per regulärem Ausdruck (kein
XML-Parser im Projekt vorhanden, das Format ist eng genug umrissen um ohne
auszukommen) — Rückgabeformat `[{ key, values: [] }]`, analog zu
`sqlRepository.js`s `getAttributeKeys()`, nur dass `values` hier aus dem
Schema stammt (nur für `Kind="DropDown"`/`"Check"`-Attribute gefüllt) statt
aus tatsächlich beobachteten Item-Werten.

## Offene Punkte / noch zu verifizieren

- [x] **PUT-Body für `/api/v1/items/<id>`** – verifiziert, siehe oben
- [x] **PUT-Body für `/api/v1/playlists/...`** – verifiziert, siehe oben
- [x] Fehlerformat bei nicht existierender Ressource – verifiziert
      (404, Klartext-Body)
- [ ] Vollständige Liste möglicher `Markers`-Schlüssel – bei ~20
      stichprobenartig geprüften Items (Musik + alle Sweeper-Items)
      wurden ausschließlich `CueIn`, `CueOut`, `FadeOut`, `StartNext`
      beobachtet. `FadeIn`, `FadeEnd`, `Hook`/`HookIn`/`HookOut`,
      `Ramp1`/`2`/`3` bisher nicht gesehen – noch zu klären ob diese
      Marker-Typen in diesem Bestand einfach nicht genutzt werden, oder
      ob sie anders im JSON heißen als angenommen
- [ ] Verhalten bei echtem Versionskonflikt (zwei überlappende
      Schreibvorgänge) – bisher nur der Erfolgsfall getestet
- [ ] Fehlerformat bei ungültigem PUT-Body (kaputtes JSON, falscher
      Datentyp)
- [x] `/api/v1/config` Response-Struktur – verifiziert, siehe oben
      (inkl. `StandardAttributes`-XML-Schema für Item-Attribute)
- [x] `/api/v1/folders?station=1` ohne `parent` – verifiziert: liefert
      den kompletten Baum, siehe oben
- [x] Pagination bei Ordnern – kein Hinweis auf Pagination bei 155
      Ordnern in einer Antwort. Für Items in großen Ordnern weiterhin
      ungeklärt (Ordner mit sehr vielen Items noch nicht getestet)
- [ ] Item-Erstellung (`POST`? welcher Pfad? `CreateItems`-Capability
      deutet auf einen eigenen Endpunkt hin, noch nicht beobachtet)
- [x] Ordner-Erstellung/Umbenennen/Verschieben/Löschen (`EditFolders`-
      Capability) – VERIFIZIERT: `POST`/`PUT`/`DELETE /api/v1/folders...`,
      siehe "Folders (Ordnerbaum)" oben
- [ ] Storage-Verwaltung (`EditStorages`-Capability, Endpunkt noch nicht
      beobachtet)
- [ ] Pagination bei Items in einzelnen großen Ordnern (limit/offset
      o. ä.?) – bei Folders selbst nicht beobachtet, bei Items noch
      nicht spezifisch getestet
- [ ] **`time`-Parameter bei `?artists`/`?titles`:** Format nicht
      verifiziert (ISO-Timestamp? Datum? Von/Bis-Fenster?). Auch mit
      `artists`/`titles` als echtem bare Flag (ohne `=`) und ohne
      `time`-Parameter liefert der Server weiterhin komplette
      Item-Objekte statt einer Distinct-Liste — Ursache ungeklärt,
      vermutlich doch der fehlende/falsche `time`-Wert. Nicht
      blockierend: Artist-/Titel-Suche ist ein Nice-to-have-Feature,
      `getArtists`/`getTitles` in `apiRepository.js` funktionieren
      (liefern nur mehr Daten als nötig)
- [x] **`/api/v1/storages`** – VERIFIZIERT: Endpunkt existiert doch, live
      getestet (2 Storages), Response-Format vollständig dokumentiert,
      siehe "Storages / Audio-Dateien" oben
- [ ] **Kein `/api/v1/itemtypes`-Endpunkt gefunden** – weder ein eigener
      Endpunkt noch ein Feld in `/api/v1/config`. `sqlRepository.js`s
      `getItemTypes()` braucht ein `DISTINCT type, COUNT(*) GROUP BY type`
      über die gesamte Items-Tabelle; die API hat dafür keine Entsprechung
      ohne alle ~155 Ordner einzeln abzufragen. Eine hartcodierte Liste
      (Music/Jingle/Sweeper/Drop/Container/Dummy, aus beobachteten
      `Type`-Werten) wurde erwogen, aber verworfen: `hasItems`/`note` wären
      dann geraten statt aus echten Daten abgeleitet.
      `apiRepository.js`s `getItemTypes()` bleibt deshalb der leere Stub.
- [ ] **Kein Logs-/Sendeprotokoll-Endpunkt gefunden** – nur
      `/api/v1/items/<id>/history` (pro Item) existiert, das skaliert nicht
      für eine Gesamtübersicht. `getLogs()`/`getRecentLogs()` liefern
      deshalb ein leeres Ergebnis statt eines Fehlers.
- [x] **`getDashboardStats`/`getTodayPlaylist` über die API** –
      `getTodayPlaylist()` ist voll implementiert (baut auf
      `getPlaylistsByDate`/`getPlaylistById` auf). `getDashboardStats()`
      liefert `totalFolders` (aus `getFolders().length`), `totalUsers`
      (aus der DATA_SOURCE-unabhängigen `webAuthDb`), `totalStorages`
      (Länge der `/api/v1/storages`-Liste) und `totalItems` (Summe aller
      `ItemCount`-Werte aus derselben Liste, siehe "Storages /
      Audio-Dateien" oben) – kein Scan aller Ordner nötig.
- [ ] Rate-Limiting oder Verbindungslimits
- [ ] **Alternative Authentifizierung per Token:** Der offizielle
      mAirList-Client bietet in seiner "Internet Client"-Konfiguration
      neben Benutzername/Passwort auch ein separates "Token"-Feld an
      (beobachtet in der Connection-Config-UI). Wie dieser Token erzeugt
      wird und in welcher Form er beim Request übertragen wird (Header?
      Query-Parameter?) ist nicht verifiziert – unsere eigene Anbindung
      nutzt bisher ausschließlich HTTP Basic Auth mit
      Benutzername/Passwort, was nachweislich funktioniert

## Quelle

Beobachtet über die Server-Logausgabe (`mAirListDB Server`-Fenster) beim
Verbinden eines echten mAirList-6.3.24-Clients, sowie manuelle GET- und
PUT-Requests über Browser und PowerShell (`Invoke-RestMethod`) gegen die
laufende Produktivinstanz. Alle dokumentierten PUT-Bodies wurden aktiv
gegen die echte Datenbank getestet und per anschließendem GET verifiziert
(Testwerte danach zurückgesetzt). Stand: 04.09.2026.
