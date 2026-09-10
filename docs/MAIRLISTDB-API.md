# 🌐 MAIRLISTDB-API.md

# mAirListDB Server – REST API (reverse-engineered)

Diese Dokumentation basiert auf beobachtetem HTTP-Traffic des offiziellen
mAirList-Clients (Version 6.3.24.4498) gegen den `mAirListDB Server` (Port 8840,
`ServerMode=HTTP`, laut `dbserver.ini`). Sie ist **nicht offiziell** und
unvollständig – es sind nur die Endpunkte dokumentiert, die im Traffic
tatsächlich beobachtet wurden. Response-Formate sind anhand echter Antworten
protokolliert. Die POST- und PUT-Bodies sind inzwischen über zwei
Wireshark-Mitschnitte des echten Clients verifiziert und als solche
markiert.

**Implementiert in:** [`server/data/apiRepository.js`](../server/data/apiRepository.js)
(`DATA_SOURCE=api`) — die Repository-Funktionen setzen exakt die hier
dokumentierten Endpunkte um. Funktionsumfang und aktueller Stand (was
verfügbar ist, was bewusst als "noch nicht verfügbar" abgefangen wird):
siehe [`docs/FEATURES.md` – API-basierte Datenquelle](FEATURES.md#-api-basierte-datenquelle-mairlistdb-server).

## Grundlagen

- **Base URL:** `http://<server>:8840`
- **Auth:** HTTP Basic Authentication, Zugangsdaten identisch mit den
  mAirList-Benutzerkonten (`auth_users` in der jeweiligen Instanz-`auth.db`)
- **Auth (Alternative):** Der offizielle Client nutzt stattdessen
  `Authorization: Bearer <token>` mit dem Token aus seiner "Internet
  Client"-Konfiguration. Unsere Anbindung bleibt bei Basic Auth, was
  nachweislich für alle Endpunkte funktioniert.
- ⚠️ **Sicherheitshinweis – unverschlüsseltes HTTP:** Der DBServer läuft
  im dokumentierten Setup über Klartext-HTTP (Port 8840). Zugangsdaten
  gehen damit bei *jeder* Anfrage im Klartext übers Netz — Basic Auth
  (Base64 ist keine Verschlüsselung) genau wie ein Bearer-Token. Für
  einen Betrieb außerhalb des lokalen Netzes ist TLS zwingend: der
  DBServer unterstützt laut `dbserver.ini` `SSLPort=9840` mit
  `SSLCertificateFile`/`SSLKeyFile`.
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
| GET | `/api/v1/items?search=<begriff>&fields=All&limit=50&station=1` | **VERIFIZIERT:** Volltextsuche über die Bibliothek (siehe unten) |
| GET | `/api/v1/items/<id>?station=1` | Einzelnes Item, vollständig |
| GET | `/api/v1/items?ids=<id>[,<id>...]&icons=true&station=1` | Mehrere Items gezielt per ID; `icons=true` liefert `IconData` (das Cover) mit |
| GET | `/api/v1/items?artists&time=...&station=1` | Distinct-Liste der Artists (Such-/Filter-Funktion) |
| GET | `/api/v1/items?titles&time=...&station=1` | Distinct-Liste der Titel |
| GET | `/api/v1/items?folder=<id>&time=...&station=1` | Items mit Sendezeit-Kontext (z. B. für Scheduling-Anzeige) |
| GET | `/api/v1/items?folder=<id>&id=<id>&station=1` | Gezielte Abfrage eines Items innerhalb eines Ordnerkontexts (beobachtet direkt nach einem PUT, vermutlich zur Bestätigung/Refresh) |
| GET | `/api/v1/items/<id>/folders?station=1` | Ordner-Zuordnungen eines Items |
| GET | `/api/v1/items/<id>/restrictions?station=1` | Restriktionen (Campaigns/Sperren) eines Items |
| GET | `/api/v1/items/<id>/history?station=1` | Abspielhistorie eines Items |
| PUT | `/api/v1/items/<id>` | **VERIFIZIERT:** Item aktualisieren (siehe unten) |
| PUT | `/api/v1/items/<id>/restrictions` | **VERIFIZIERT:** Restriktionen schreiben (siehe unten) |
| POST | `/api/v1/items?station=1` | **VERIFIZIERT:** neues Item anlegen |
| DELETE | `/api/v1/items/<id>?station=1` | **VERIFIZIERT:** Item löschen |

### Item-Typen (`Type`-Feld) – VERIFIZIERT (24 von 27)

Es gibt keinen `/api/v1/itemtypes`-Endpunkt (siehe "Offene Punkte"
unten). Die folgende Zuordnung Client-Anzeige ↔ DB-Wert wurde per
Live-Abfrage gegen die echte Datenbank ermittelt (Testitems je Typ im
mAirList-Client angelegt, per `GET /api/v1/items/<id>` den `Type`-Wert
ausgelesen):

| Deutsch (Client-Anzeige) | DB-Wert (`Type`) |
|---|---|
| Musik | `Music` |
| Moderation | `Voice` |
| Nachrichten | `News` |
| Wetter | `Weather` |
| Verkehr | `Traffic` |
| Werbung | `Advertising` |
| Beitrag | `Package` |
| Jingle | `Jingle` |
| Sweeper | `Sweeper` |
| Drop | `Drop` |
| Trailer | `Trailer` |
| Promo | `Promo` |
| Sponsor-Jingle | `Sponsorship` |
| Station-ID | `StationID` |
| Bett | `Bed` |
| Instrumental | `Instrumental` |
| Sendung | `Show` |
| Stream | `Stream` |
| Playlist | `Playlist` |
| Befehl | `Command` |
| Unterbrechung | `Break` |
| Stille | `Silence` |
| Fehler | `Error` |
| Andere | `Other` |
| Platzhalter | `Dummy` |

**Nicht verifiziert** (im aktuellen Bestand nicht vorhanden): Container
(siehe eigenen Abschnitt unten, hat ein eigenes Konzept), Cartwall-Seite,
Benutzerdefiniert 1-3.

#### Container: eigenes Konzept, nicht über `Type` erkennbar

Container sind Elemente, die weitere Elemente enthalten (z. B.
Werbeblöcke). Sie tragen zusätzlich zum `Type`-Feld ein `Class`-Feld,
das die eigentliche Container-Art verrät. Verifiziert per Live-Abfrage
gegen sechs echte Test-Items:

| Titel | `Type` | `Class` |
|---|---|---|
| Nachrichten-Container | `News` | `NewsContainer` |
| Hook-Container | `Container` | `HookContainer` |
| Automatischer Hook-Container | `Container` | `AutoHookContainer` |
| Auto-Hook-Container-Marker | `Dummy` | `AutoHookContainerMarker` |
| Regionen-Container (Regionalisierung) | `Container` | `RegionContainer` |
| Einfacher Container | `Container` | `Container` |

> ⚠️ **Falle für jede typbasierte Anzeige-/Logik-Prüfung:** Der
> Nachrichten-Container hat `Type: "News"`, **NICHT** `Type: "Container"`.
> Auf Type-Ebene sieht er aus wie eine normale Nachrichtenmeldung, ist
> aber technisch ein Container mit Inhalt (ebenso hat der
> Auto-Hook-Container-Marker `Type: "Dummy"`, nicht `"Container"`). Jede
> Logik, die prüfen will "ist das ein Container", **muss zusätzlich das
> `Class`-Feld** auf einen der obigen `*Container`/`*ContainerMarker`-Werte
> prüfen — sich nur auf `Type: "Container"` zu verlassen übersieht
> mindestens diese beiden Fälle.

Container-Items haben (bei leerem Inhalt) ein leeres `Items`-Array. In
eine Playlist eingebettet enthält dieses Array die tatsächlichen
Sub-Elemente (siehe "Response: gefüllte Stunde" weiter unten).
`InnerFadeDuration` und `Options` (Wert `["NoLogging"]` beobachtet) sind
container-spezifische Zusatzfelder, bisher nicht weiter ausgewertet.

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

### GET `/api/v1/items?search=<begriff>&fields=All&limit=50&station=1` – VERIFIZIERT

Volltextsuche über die Bibliothek, per Wireshark-Mitschnitt des echten
Clients (6.3.24.4498) beobachtet. Damit gibt es doch einen Endpunkt für
eine ordnerübergreifende Item-Abfrage — bis dahin die Annahme, dass
`GET /api/v1/items` immer `folder=` oder `ids=` verlangt.

| Parameter | Beobachteter Wert | Bedeutung |
|---|---|---|
| `search` | Suchbegriff, Leerzeichen als `+` kodiert | der eigentliche Suchtext |
| `fields` | `All` | einzuschließende Felder; weitere gültige Werte unbekannt (vermutlich Feldnamen wie `Artist`/`Title`) |
| `limit` | `50` | maximale Trefferzahl; der Client fragt immer 50 an |
| `station` | `1` | wie überall |

- **Response:** Array von Item-Objekten im **gleichen erweiterten Format
  wie `/api/v1/items?folder=<id>`** — inklusive `Folders`, `NextUse`,
  `LastUse`, `LastPlayed`, `EffectiveDuration`.
- **Noch offen:** ob `offset`/`page` für Pagination existieren, welche
  Werte `fields` sonst akzeptiert, und ob die Suche Wortanfang oder
  Teilstring matcht.

Damit ist `searchItems()` in `apiRepository.js` umsetzbar — bisher ein
bewusst leerer Stub, weil kein Such-Endpunkt bekannt war.

### PUT `/api/v1/items/<id>` – VERIFIZIERT

Der Body ist **exakt symmetrisch zum GET-Format**: das komplette
Item-Objekt (wie von GET zurückgegeben) wird mit geänderten Werten per
PUT zurückgeschickt. Verifiziert per PowerShell (`Invoke-RestMethod`):
Item gelesen, `Markers.FadeOut` geändert, unverändertes JSON per PUT
gesendet, anschließend per GET bestätigt dass der neue Wert
tatsächlich persistiert wurde.

- **Content-Type:** `application/json` (funktioniert nachweislich). Der
  **offizielle Client nutzt hier allerdings ebenfalls
  `application/x-www-form-urlencoded` mit `$doc`** (Wireshark-Mitschnitt,
  siehe "POST-Endpunkte (form-urlencoded)"). Der Server akzeptiert also
  beides; `apiRepository.js`s `updateItem()` bleibt bei JSON.
- **Response bei Erfolg:** `null` (leerer Body, Status 200)
- Es reicht, das komplette vom GET erhaltene Objekt zu nehmen, einzelne
  Felder zu ändern und unverändert zurückzuschicken – keine Teil-Updates
  nötig, kein separates "Diff"-Format

**Body-Variante des offiziellen Clients (Wireshark, form-urlencoded):**

```
station=1&$doc={...vollständiges Item-JSON...}
```

Beide Wege funktionieren nachweislich: `application/json` (unsere
Variante, seit Wochen im Einsatz) und `application/x-www-form-urlencoded`
mit `$doc` (die Client-Variante). Kein Handlungsbedarf in
`apiRepository.js`.

#### Schreibbare Felder im PUT-Body – VERIFIZIERT

Der mitgeschnittene Client-Body enthält deutlich mehr Felder als das
minimale GET-Beispiel oben. Alle davon gehen beim normalen Item-PUT mit,
es braucht dafür **keine eigenen Endpunkte**:

| Feld | Beispiel / Format | Bedeutung |
|---|---|---|
| `Attributes` | `{"Stimmung":"high"}` | Item-Attribute — kein separater Attribut-Endpunkt nötig |
| `IconData` | base64-kodiertes JPEG | **Das Cover.** Lesbar auch über `?icons=true` (siehe unten) |
| `CueData` | `{"Items":[{"Artist":"…","ItemType":"Music","Title":"…","Class":"Track"}]}` | verschachtelte Track-Infos: was im Element enthalten ist (z. B. bei Mitschnitten/Containern) |
| `Type` | `"Voice"` beobachtet | Item-Typ; `Voice` = Voice Track (siehe "Voice Tracking" unten) |
| `Database` | `"mAirListDB:{GUID}"` | Datenbankkennung |

`IconData` löst den offenen Punkt "Cover ist im api-Modus nicht
verfügbar": Cover sind sowohl **lesbar** (`?icons=true` bzw. im
`?folder=`-Format) als auch **schreibbar** (dieses Feld im PUT-Body).

### PUT `/api/v1/items/<id>/restrictions` – VERIFIZIERT

Schreibt die Sendebeschränkungen eines Items (Gegenstück zum bereits
dokumentierten `GET /api/v1/items/<id>/restrictions`).

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (dekodiert):**
  ```
  station=1&$doc={"NotBefore":null,"NotAfter":null,"Hours":"1111...0111"}
  ```

| Feld | Format | Bedeutung |
|---|---|---|
| `NotBefore` | ISO-Datum oder `null` | frühestes Sendedatum; `null` = keine Untergrenze |
| `NotAfter` | ISO-Datum oder `null` | spätestes Sendedatum; `null` = keine Obergrenze |
| `Hours` | Bit-String mit **exakt 168 Zeichen** | Stundenraster, 7 Tage × 24 Stunden |

**Das `Hours`-Bitraster:** `"1"` = Sendung in dieser Stunde erlaubt,
`"0"` = gesperrt. 168 = 7 × 24 passt eindeutig auf ein Wochenraster.

⚠️ **Reihenfolge nicht zweifelsfrei belegt:** vermutlich Montag 0 Uhr bis
Sonntag 23 Uhr (also Tag-für-Tag, innerhalb eines Tages stundenweise).
Beim Implementieren gegen die Client-Anzeige gegenprüfen — ein einzelnes
gesetztes Bit an bekannter Position schreiben und im offiziellen Client
nachsehen, welche Zelle markiert ist. Ein Off-by-one im Wochentag oder
eine spalten- statt zeilenweise Anordnung wären aus dem Mitschnitt allein
nicht unterscheidbar.

### POST `/api/v1/items?station=1` – VERIFIZIERT

Live gegen den Server getestet (schrittweises Ermitteln der Pflichtfelder
durch gezieltes Weglassen):

```json
{
  "Title": "...",
  "Type": "Music",
  "Class": "File",
  "Filename": "/storages/1/files/dateiname.mp3"
}
```

- **Pflichtfelder:** `Class` (ohne → Fehler `"Invalid playlist item
  class"`) und `Filename` (ohne → Fehler `"Invalid location type"`).
  `Title` und `Type` wurden ohne Weiteres akzeptiert.
- Weitere Felder aus dem PUT-Format (`Markers`, `Attributes`,
  `Amplification` etc.) sind vermutlich optional mitgebbar, analog zu
  PUT — nicht einzeln durchgetestet.
- **Response bei Erfolg:** ein **nackter JSON-String** mit der neuen
  Item-ID, z. B. `"2634"` — **kein** Objekt wie bei GET/PUT.
- Um das vollständige Item zurückzugeben, muss im Anschluss ein
  `GET /api/v1/items/<neue-id>` erfolgen (macht `apiRepository.js`s
  `createItem()` bereits, analog zu `updateItem()`).

**Ordner-Zuordnung – VERIFIZIERT:** Der im Client-Traffic zusätzlich
beobachtete Aufruf `POST /api/v1/folders/<folderId>/items` (direkt nach
dem `POST /items`) ordnet das neue Item einem Ordner zu. Das Body-Format
ist inzwischen per Wireshark-Mitschnitt entschlüsselt: form-urlencoded
mit `add`-Flag und `$doc`-Array, siehe "POST-Endpunkte
(form-urlencoded)" unten. `apiRepository.js` setzt das in
`assignItemsToFolder(folderId, itemIds)` um; `createItem()` ruft das nach
dem `POST /items` auf, wenn eine `folderId` mitgegeben wurde. Schlägt nur
die Zuordnung fehl, wird das (bereits angelegte) Item trotzdem
zurückgegeben und der Fehler geloggt.

### DELETE `/api/v1/items/<id>?station=1` – VERIFIZIERT

- **Response bei Erfolg:** `null`, Status 200.

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
- Container-Items (z. B. Werbeblöcke) haben eine eigene `Items`-Liste
  für ihre Unterelemente — VERIFIZIERT, siehe "Item-Typen (`Type`-Feld)"
  oben. ⚠️ `Class` ist dabei nicht auf `"Container"` beschränkt (u. a.
  `NewsContainer`, `HookContainer`, `AutoHookContainer`,
  `AutoHookContainerMarker`, `RegionContainer` beobachtet) — für eine
  Container-Erkennung reicht `Type: "Container"` allein nicht aus
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

**Body-Variante des offiziellen Clients (Wireshark) – `BaseTime`, kein
`VersionInfo`:**

```
station=1&$doc={"BaseTime":"2026-07-30T16:00:00","Items":[...]}
```

- **`BaseTime`** ist der ISO-Zeitstempel des Stundenbeginns — also
  redundant zum Datum/Stunde im Pfad. Der Client schickt es trotzdem
  mit; ob der Server es auswertet oder ignoriert, ist nicht geprüft.
- **`VersionInfo` fehlt im Client-Body komplett.** Unsere Implementierung
  schickt `{Items, VersionInfo}` als JSON und funktioniert nachweislich
  (der Server zählt die Version hoch und gibt sie zurück). `VersionInfo`
  ist beim Schreiben also **offenbar optional** — der Server leitet die
  neue Version selbst ab, statt die mitgeschickte zu prüfen.
- Das ist ein **Indiz**, aber kein Beweis dafür, dass es kein
  optimistisches Locking gibt: möglich bleibt, dass der Server eine
  *mitgeschickte* Version prüft und eine fehlende schlicht durchwinkt.
  Der offene Punkt "Verhalten bei echtem Versionskonflikt" bleibt
  deshalb bestehen.
- **Kein Handlungsbedarf:** Unsere JSON-Variante mit `VersionInfo` läuft
  produktiv; `BaseTime` wird nicht gesendet und offensichtlich auch nicht
  gebraucht.

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

## POST-Endpunkte (form-urlencoded) – VERIFIZIERT

Per Wireshark-Mitschnitt des echten mAirList-Clients (6.3.24.4498) wurden
die POST-Request-Bodies vollständig entschlüsselt. Das erklärt die vorher
unlösbare Fehlermeldung `Invalid operation` bei
`POST /api/v1/folders/<id>/items`.

**Zentrale Erkenntnis:** Alle POST-Endpunkte des mAirListDB Servers nutzen
HTTP/1.0 und `Content-Type: application/x-www-form-urlencoded` — nicht
`application/json`. Das eigentliche JSON steckt URL-kodiert im Parameter
`$doc`:

```
[<operation>&]station=<id>&$doc=<urlencoded JSON>
```

Das führende Operations-Flag ist in der Regel ein **nackter Parameter
ohne Wert** (z. B. `add`, `delete`); `movefrom=<quellId>` ist die
Ausnahme mit Wert. Fehlt das Flag dort, wo der Server es erwartet,
antwortet er mit `Invalid operation`.

**Das gilt nicht nur für POST:** Auch die PUT-Endpunkte nutzen beim
offiziellen Client form-urlencoded mit `$doc` — mitgeschnitten für
`PUT /api/v1/items/<id>` (Item aktualisieren) und
`PUT /api/v1/items/<id>/folders` (siehe unten). Bei
`PUT /api/v1/items/<id>` akzeptiert der Server **zusätzlich**
`application/json`; die JSON-Variante in `apiRepository.js`s
`updateItem()` funktioniert nachweislich und bleibt deshalb unverändert.

### POST `/api/v1/items` – Item anlegen

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (dekodiert):**
  ```
  station=1&$doc={"Title":"Platzhalter","Type":"Dummy","Class":"Dummy"}
  ```
- **Kein** Operations-Flag.
- **Response:** die neue Item-ID als nackter JSON-String, z. B. `"2638"`
- **Pflichtfelder im `$doc`:** `Class` (sonst `Invalid playlist item
  class`), zusätzlich `Filename` bei `Class:"File"` (sonst `Invalid
  location type`) — siehe "Items (Library)" oben.

**Hinweis:** Dieser Endpunkt akzeptiert offenbar *auch*
`application/json` (per PowerShell erfolgreich getestet, gab ebenfalls
eine ID zurück). Der offizielle Client nutzt aber form-urlencoded.

### POST `/api/v1/folders/<folderId>/items` – Item einem Ordner zuordnen

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (dekodiert):**
  ```
  add&station=1&$doc=["2638"]
  ```
- **Ein Operations-Flag ist zwingend** (fehlt es → `Invalid operation`).
- `$doc` ist ein JSON-**Array** von Item-IDs als Strings — es können also
  mehrere Items auf einmal verarbeitet werden.
- **Response:** `null` (Status 200)

Dieser Endpunkt akzeptiert **kein** `application/json`: sieben
JSON-Varianten wurden erfolglos getestet, alle mit `Invalid operation`,
weil das Operations-Flag fehlte.

#### Die drei Operations-Flags – ALLE VERIFIZIERT

Per Wireshark-Mitschnitt des offiziellen Clients (6.3.24):

| Flag | Body (dekodiert) | Bedeutung |
|---|---|---|
| `add` | `add&station=1&$doc=["2639"]` | Item(s) diesem Ordner **hinzufügen** |
| `movefrom=<quellId>` | `movefrom=8&station=1&$doc=["2639"]` | Item(s) aus dem Quellordner **in diesen Ordner verschieben** |
| `delete` | `delete&station=1&$doc=["2639"]` | Item(s) aus diesem Ordner **entfernen** (löscht die Items nicht) |

`add` und `delete` sind **nackte Flags ohne Wert**; `movefrom` ist ein
Flag **mit Wert** (der Quellordner-ID).

Umgesetzt in `apiRepository.js` als `assignItemsToFolder(folderId,
itemIds)` (`add`) und `removeItemFromFolder(folderId, itemIds)`
(`delete`). `movefrom` wird bewusst **nicht** verwendet — siehe
`moveItemToFolder()` unten.

### PUT `/api/v1/items/<itemId>/folders` – VERIFIZIERT

- **Content-Type:** `application/x-www-form-urlencoded`
- **Body (dekodiert):**
  ```
  station=1&$doc=["5","189","7"]
  ```
- **Kein** Operations-Flag — der Endpunkt kennt nur "ersetzen".
- Setzt die **komplette** Ordner-Zugehörigkeit eines Items in einem
  Request und ersetzt die bisherige Zuordnung vollständig. Idempotent;
  ein leeres Array entfernt das Item aus allen Ordnern.

Umgesetzt als `setItemFolders(itemId, folderIds)`.

**`moveItemToFolder(id, folderId)` nutzt diesen Endpunkt**, nicht
`movefrom`: Das SQL-Pendant in `sqlRepository.js` löscht via
`writeFolder()` *alle* `item_folders`-Zeilen des Items und legt genau
eine neue an — die Zuordnung wird also komplett ersetzt. `movefrom`
verschiebt dagegen nur aus *einem* Quellordner; läge das Item in
mehreren, bliebe es in den übrigen liegen. Ein Nachbauen über
`getItemFolders()` + je ein Request pro Quellordner wäre zudem nicht
atomar. `PUT /items/<id>/folders` erledigt dasselbe in einem einzigen,
idempotenten Request.

### POST `/api/v1/storages/<storageId>/files` – Datei hochladen

- **Content-Type:** `multipart/form-data; boundary=--------<zeitstempel>`
- Ein Part:
  ```
  Content-Disposition: form-data; name="file"; filename="Nebula (Robot Koch Remix).mp3"
  Content-Type: audio/x-mpg
  Content-Transfer-Encoding: binary
  ```
- Feldname ist `file`, der Dateiname steht im `filename`-Attribut.

### Ablauf beim Item-Anlegen im offiziellen Client

1. `POST /api/v1/storages/<id>/files` – Datei hochladen (multipart)
2. `POST /api/v1/items` – Datensatz anlegen, gibt die neue ID zurück
3. `POST /api/v1/folders/<id>/items` mit `add&station=1&$doc=["<neueId>"]`
   – Item dem Ordner zuordnen

## Voice Tracking – kein eigener Endpunkt

Im Wireshark-Mitschnitt wurde der komplette Voice-Tracking-Ablauf des
offiziellen Clients beobachtet. Zentrale Erkenntnis: **es gibt keine
dedizierte Voice-Tracking-API.** Ein Voice Track ist technisch ein
ganz normales Item vom `Type: "Voice"`, dessen Audiodatei über den
Storage-Upload hochgeladen wurde.

Beobachteter Ablauf:

1. `GET /api/v1/stations/<id>/config/VoiceTrackImportFolder`
   – Zielordner für importierte Voice Tracks. Bei dieser Installation
   **leer**, also nicht konfiguriert.
2. `GET /api/v1/folders/unsorted/config`
   – `unsorted` ist eine **Spezial-Folder-ID** für nicht einsortierte
   Elemente (offenbar der Fallback, wenn kein Import-Ordner gesetzt ist).
   Antwort hier: `{}`.
3. `POST /api/v1/storages/<id>/files` – Audiodatei hochladen (multipart,
   siehe oben).
4. Item mit `Type: "Voice"` anlegen (`POST /api/v1/items`), Rest wie bei
   jedem anderen Item.

**Für die geplante Phase E (Voice Tracking) heißt das:** die API-seitigen
Bausteine existieren in `apiRepository.js` bereits alle — Upload,
`createItem()`, `insertPlaylistItem()`. Es braucht keinen neuen
Endpunkt-Reverse-Engineering-Schritt mehr, nur noch die Aufnahme- und
Mix-Logik im Frontend.

**Noch offen:** Welche Felder ein Voice-Track-Item über `Type: "Voice"`
hinaus braucht (Overlaps/Ramp-Marker zum vorherigen und nächsten
Element), und ob `VoiceTrackImportFolder` bei gesetztem Wert eine
Ordner-ID oder einen Pfad enthält — die Installation im Mitschnitt hatte
den Wert leer.

## Stations-Konfiguration und Spezial-IDs

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/stations/<id>/config` | komplette Stations-Konfiguration |
| GET | `/api/v1/stations/<id>/config/<key>` | einzelner Konfigurationsschlüssel |
| GET | `/api/v1/folders/unsorted/config` | Config des Spezial-Ordners `unsorted` |

- Beobachteter Konfigurationsschlüssel: **`VoiceTrackImportFolder`**
  (bei dieser Installation leer). Weitere Schlüssel sind nicht
  mitgeschnitten — `GET /api/v1/stations/<id>/config` ohne Key sollte
  die vollständige Liste liefern, das Response-Format ist aber noch
  nicht protokolliert.
- **`unsorted` ist eine Spezial-Folder-ID**, kein numerischer Ordner:
  sie steht für nicht einsortierte Elemente. Ob sie auch bei
  `GET /api/v1/items?folder=unsorted` funktioniert, ist nicht getestet.
  `/api/v1/folders/unsorted/config` antwortete hier mit `{}`.

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
- [x] **Such-Endpunkt für Items** – VERIFIZIERT per Wireshark:
      `GET /api/v1/items?search=<begriff>&fields=All&limit=50&station=1`,
      Response im gleichen erweiterten Format wie `?folder=`.
      `searchItems()` in `apiRepository.js` ist damit **umsetzbar**
      (bisher leerer Stub), aber noch nicht implementiert
- [x] **Cover im api-Modus** – GEKLÄRT: das Feld heißt `IconData`
      (base64-JPEG). Lesbar über `?icons=true` bzw. im
      `?folder=`-Format, **schreibbar** über den normalen
      `PUT /api/v1/items/<id>`. Noch nicht im Frontend angebunden
- [x] **Restrictions schreiben** – VERIFIZIERT:
      `PUT /api/v1/items/<id>/restrictions`, form-urlencoded mit
      `$doc={"NotBefore":…,"NotAfter":…,"Hours":"<168 Bit>"}`.
      Offen bleibt nur die **Bit-Reihenfolge** im `Hours`-String
      (vermutlich Mo 0 Uhr → So 23 Uhr, gegen die Client-Anzeige zu prüfen)
- [x] **Voice Tracking** – GEKLÄRT: kein eigener Endpunkt, ein Voice
      Track ist ein Item mit `Type:"Voice"` plus Storage-Upload, siehe
      Abschnitt "Voice Tracking"
- [x] **PUT-Body für `/api/v1/playlists/...`** – verifiziert, siehe oben.
      Der offizielle Client schickt `BaseTime` und **kein** `VersionInfo`
      (siehe dort) — `VersionInfo` ist beim Schreiben offenbar optional
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
- [x] Item-Erstellung/-Löschung (`CreateItems`-Capability) – VERIFIZIERT:
      `POST`/`DELETE /api/v1/items...`, siehe "Items" oben
- [x] **Ordner-Zuordnung neuer Items** (`POST /api/v1/folders/<id>/items`)
      – VERIFIZIERT per Wireshark-Mitschnitt: form-urlencoded,
      `add&station=1&$doc=["<id>",...]`, siehe "POST-Endpunkte
      (form-urlencoded)" oben. Umgesetzt als `assignItemsToFolder()`,
      von `createItem()` bei gesetzter `folderId` aufgerufen
- [x] **Operations-Flag zum Entfernen eines Items aus einem Ordner** –
      VERIFIZIERT per Wireshark: `delete&station=1&$doc=[...]` auf
      `POST /api/v1/folders/<id>/items`, dazu `movefrom=<quellId>` zum
      Verschieben. Ebenfalls verifiziert:
      `PUT /api/v1/items/<id>/folders` setzt die komplette
      Ordner-Zugehörigkeit auf einmal. Umgesetzt als
      `removeItemFromFolder()`, `setItemFolders()` und
      `moveItemToFolder()` — der Stub ist entfallen
- [x] **Body-Format aller POST-Endpunkte** – VERIFIZIERT: nicht JSON,
      sondern `application/x-www-form-urlencoded` mit `$doc`-Parameter
      (Datei-Upload: `multipart/form-data`), siehe eigener Abschnitt
- [x] Ordner-Erstellung/Umbenennen/Verschieben/Löschen (`EditFolders`-
      Capability) – VERIFIZIERT: `POST`/`PUT`/`DELETE /api/v1/folders...`,
      siehe "Folders (Ordnerbaum)" oben
- [ ] Storage-Verwaltung (`EditStorages`-Capability, Endpunkt noch nicht
      beobachtet)
- [ ] **Response-Format von `GET /api/v1/stations/<id>/config`** (ohne
      Key) und die vollständige Schlüsselliste — bisher nur
      `VoiceTrackImportFolder` beobachtet
- [ ] **Spezial-Folder-ID `unsorted`** – nur
      `/api/v1/folders/unsorted/config` beobachtet (Antwort `{}`); ob
      `GET /api/v1/items?folder=unsorted` die nicht einsortierten Items
      liefert, ist ungetestet
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
- [x] **Kein `/api/v1/itemtypes`-Endpunkt gefunden** – weder ein eigener
      Endpunkt noch ein Feld in `/api/v1/config`. `sqlRepository.js`s
      `getItemTypes()` braucht ein `DISTINCT type, COUNT(*) GROUP BY type`
      über die gesamte Items-Tabelle; die API hat dafür keine Entsprechung
      ohne alle ~155 Ordner einzeln abzufragen. `apiItems.js`s
      `getItemTypes()` liefert deshalb eine hartcodierte Liste. VERIFIZIERT:
      24 von 27 Typen aus dem Client-Dropdown sind per Live-Abfrage gegen
      die echte DB bestätigt, siehe Abschnitt "Item-Typen (Type-Feld)"
      unten. Nicht verifiziert: Cartwall-Seite, Benutzerdefiniert 1-3 (im
      Bestand nicht vorhanden). `hasItems`/`note` sind bei dieser Liste
      weiterhin keine echten DB-Werte, sondern Platzhalter
      (`hasItems: true`, `note: ""`).
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
- [x] **Alternative Authentifizierung per Token:** Der Client überträgt
      den Token aus seiner "Internet Client"-Konfiguration als
      `Authorization: Bearer <token>`-Header (Wireshark-Mitschnitt).
      Wie der Token serverseitig erzeugt/verwaltet wird, ist weiterhin
      offen. Unsere Anbindung nutzt weiter HTTP Basic Auth mit
      Benutzername/Passwort, was nachweislich für alle Endpunkte
      funktioniert
- [ ] **Betrieb über TLS (`SSLPort=9840`)** – laut `dbserver.ini`
      unterstützt, aber nicht getestet. Solange über Klartext-HTTP
      gearbeitet wird, gehen Zugangsdaten bei jeder Anfrage unverschlüsselt
      übers Netz (siehe Sicherheitshinweis unter "Grundlagen")

## Quelle

Beobachtet über die Server-Logausgabe (`mAirListDB Server`-Fenster) beim
Verbinden eines echten mAirList-6.3.24-Clients, sowie manuelle GET- und
PUT-Requests über Browser und PowerShell (`Invoke-RestMethod`) gegen die
laufende Produktivinstanz. Alle dokumentierten PUT-Bodies wurden aktiv
gegen die echte Datenbank getestet und per anschließendem GET verifiziert
(Testwerte danach zurückgesetzt). Die POST-Bodies stammen aus einem
Wireshark-Mitschnitt des echten Clients (siehe "POST-Endpunkte
(form-urlencoded)").

Ein **zweiter Wireshark-Mitschnitt (07.09.2026)** ergänzte den
Such-Endpunkt (`?search=`), das Body-Format von
`PUT /items/<id>/restrictions` inkl. `Hours`-Bitraster, die zusätzlich
schreibbaren Item-Felder (`IconData`/`Attributes`/`CueData`/`Type`), den
`BaseTime`-Befund beim Playlist-PUT, den Voice-Tracking-Ablauf sowie die
Stations-Config-Endpunkte und die Spezial-Folder-ID `unsorted`.

Stand: 07.09.2026.
