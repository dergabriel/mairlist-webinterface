# 🌐 MAIRLISTDB-API.md

# mAirListDB Server – REST API (reverse-engineered)

Diese Dokumentation basiert auf beobachtetem HTTP-Traffic des offiziellen
mAirList-Clients (Version 6.3.24.4498) gegen den `mAirListDB Server` (Port 8840,
`ServerMode=HTTP`, laut `dbserver.ini`). Sie ist **nicht offiziell** und
unvollständig – es sind nur die Endpunkte dokumentiert, die im Traffic
tatsächlich beobachtet wurden. Response-Formate sind anhand echter Antworten
protokolliert, PUT-Bodies wurden (Stand dieser Dokumentation) noch nicht
verifiziert und sind als Annahme markiert.

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

## Server-Metadaten

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/capabilities` | Liste aktivierter Server-Features, z. B. `EditItems`, `CreateItems`, `EditPlaylist`, `EditFolders`, `EditStorages`, `EditStations`, `EditSubplaylists`, `FolderConfig`, `AssignFolders`, `MultiFolders`, `MiniScheduler`, `AdScheduler`, `PlaylistAttributes` |
| GET | `/api/v1/permissions` | Berechtigungen des eingeloggten Users (siehe unten) |
| GET | `/api/v1/config?station=1` | Server-/Stations-Konfiguration (Struktur noch nicht im Detail erfasst) |
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

## Folders (Ordnerbaum)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/v1/folders?station=1` | Alle Ordner (oder Top-Level, noch zu verifizieren ob vollständiger Baum oder nur root) |
| GET | `/api/v1/folders?parent=<id>&station=1` | Unterordner eines Ordners |
| GET | `/api/v1/folders/<id>/config?station=1` | Ordner-spezifische Konfiguration |

Beobachtete Felder pro Folder-Objekt (aus Kontext erschlossen, noch nicht
als eigenständige Response dokumentiert): `ID`, `Parent` (kann `"root"`
sein), `Name`, `SubfolderCount`.

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

**Anmerkungen:**
- `Markers` enthält nur tatsächlich gesetzte Cue-Punkte (nicht alle 17
  möglichen Typen), Schlüssel in PascalCase (`CueIn`, `CueOut`, `FadeOut`,
  `FadeEnd`, `StartNext`, `Ramp1`/`2`/`3`, `Hook`/`HookIn`/`HookOut`, etc. –
  vollständige Liste noch nicht durch Beobachtung bestätigt, nur die drei
  oben gezeigten)
- `Amplification` = Normalisierungs-Gain in dB (entspricht `gainDb` im
  aktuellen Datenmodell)
- `Levels.Loudness` = LUFS-Wert
- `Class` unterscheidet u. a. `"File"` und `"Container"` (siehe Playlists
  unten für ein Container-Beispiel)

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
| GET | `/api/v1/storages/<id>/files/<filename>?quality=default` | Audiodatei, Originalqualität |
| GET | `/api/v1/storages/<id>/files/<filename>?quality=low` | Audiodatei, transkodiert (serverseitiges Transcoding, z. B. für schnelle PFL/Preview-Wiedergabe) |

`<filename>` ist URL-encoded, entspricht dem `Filename`-Feld aus der
Item-Antwort (ohne führendes `/storages/<id>/files/`).

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

### Response: gefüllte Stunde (Struktur, gekürzt)

```json
{
  "Items": [
    {
      "Class": "Playlist",
      "Time": { "Class": "Time", "Value": "18:00:00.000" },
      "Item": {
        "Class": "File",
        "DatabaseID": "...",
        "Title": "...",
        "Artist": "...",
        "Duration": 0,
        "Markers": { "...": 0 },
        "Filename": "/storages/1/files/... oder lokaler Windows-Pfad"
      }
    },
    {
      "Class": "Playlist",
      "Time": { "Class": "Time", "Value": "..." },
      "Item": {
        "Class": "Container",
        "DatabaseID": "...",
        "Title": "...",
        "Items": [
          {
            "Item": { "...": "verschachteltes Item" },
            "PlaylistItemAttributes": {
              "AdCampaignID": "...",
              "AdEntryID": "...",
              "Advertising": "..."
            }
          }
        ]
      }
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
- Jeder Playlist-Eintrag hat `Class: "Playlist"`, eine `Time` (Startzeit
  innerhalb der Stunde) und ein verschachteltes `Item`
- `Item.Class` unterscheidet mind. `"File"` und `"Container"`
- Container-Items haben eine eigene `Items`-Liste (z. B. Werbeblöcke), jeder
  Eintrag dort hat wiederum `Item` + `PlaylistItemAttributes`
- `PlaylistItemAttributes` enthält volatile, playlist-spezifische
  Overrides (z. B. `AutoCue`, `Advertising`, `AdCampaignID`, `AdEntryID`) –
  das ist vermutlich der Ort für alles, was NICHT dauerhaft am Library-Item
  hängt, sondern nur für diesen Playlist-Slot gilt
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

## Offene Punkte / noch zu verifizieren

- [x] **PUT-Body für `/api/v1/items/<id>`** – verifiziert, siehe oben
- [x] **PUT-Body für `/api/v1/playlists/...`** – verifiziert, siehe oben
- [x] Fehlerformat bei nicht existierender Ressource – verifiziert
      (404, Klartext-Body)
- [ ] Vollständige Liste möglicher `Markers`-Schlüssel (aktuell nur
      `CueIn`, `CueOut`, `FadeOut`, `FadeEnd`?, `StartNext` bestätigt) –
      Restliche 17 Cue-Punkt-Typen (Ramp1-3, Hook/HookIn/HookOut etc.)
      noch nicht an einem echten Item mit allen Markern beobachtet
- [ ] Verhalten bei echtem Versionskonflikt (zwei überlappende
      Schreibvorgänge) – bisher nur der Erfolgsfall getestet
- [ ] Fehlerformat bei ungültigem PUT-Body (kaputtes JSON, falscher
      Datentyp)
- [ ] `/api/v1/config` und `/api/v1/config/<key>` Response-Struktur
- [ ] `/api/v1/folders?station=1` ohne `parent` – kompletter Baum oder nur
      Root-Ebene?
- [ ] Item-Erstellung (`POST`? welcher Pfad? `CreateItems`-Capability
      deutet auf einen eigenen Endpunkt hin, noch nicht beobachtet)
- [ ] Ordner-Erstellung/Löschen (`EditFolders`-Capability, Endpunkt noch
      nicht beobachtet)
- [ ] Storage-Verwaltung (`EditStorages`-Capability, Endpunkt noch nicht
      beobachtet)
- [ ] Pagination bei großen Ordnern (limit/offset o. ä.?)
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
