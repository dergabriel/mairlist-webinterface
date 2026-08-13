# 🗄️ SCHEMA.md

Echtes Datenbankschema, direkt aus einer mAirListDB (SQLite `.mldb` Datei, mAirList Version 8.x). Kein Raten, kein Reverse Engineering aus der Doku, sondern `PRAGMA table_info()` gegen die echte Datei.

> ⚠️ Diese Datenbank war kein produktiver Sender. Das Schema ist echt, die Daten sind Testdaten.

---

## 📋 Tabellen-Übersicht

| Tabelle | Zweck |
|---|---|
| `items` | Alle Bibliotheks-Items (Music, Jingle, Drop, Sweeper, ...) |
| `item_cuemarkers` | Cue-Punkte pro Item |
| `item_cuedata` | Erweiterte Cue-Daten als XML (z.B. Hüllkurven) |
| `item_attributes` | Frei definierbare Key-Value Attribute pro Item |
| `item_folders` | Zuordnung Item → Ordner (n:m) |
| `item_icons` | Cover-Bilder der Items |
| `item_restrictions` | Abspiel-Einschränkungen |
| `item_campaign_entries` | Werbung: Item → Kampagne |
| `item_campaign_regions` | Werbung: regionale Splits |
| `item_campaign_stations` | Werbung: Sender-Zuordnung |
| `item_campaigns` | Werbe-Kampagnen |
| `item_containercontent` | Inhalt von Container-Items |
| `folders` | Virtuelle Ordner (Baumstruktur) |
| `storages` | Speicherorte (Storage-Konfiguration) |
| `playlist` | Stundenbasierte Playlists |
| `playlist_info` | Metadaten pro Playlist-Stunde (Version, Editor, ...) |
| `playlist_attributes` | Attribute pro Playlist-Stunde |
| `playlistlog` | Broadcast-Log (was wann gelaufen ist) |
| `subplaylists` | Sub-Playlist Definitionen |
| `auth_users` | Benutzerkonten |
| `auth_groups` | Benutzergruppen |
| `auth_group_scopes` | Gruppen-Rechte |
| `auth_scopes` | Rechte-Definitionen |
| `auth_user_scopes` | Benutzer-Rechte (direkt) |
| `auth_clients` | API-Clients |
| `auth_sessions` | Login-Sessions |
| `auth_tokens` | Auth-Tokens |
| `config` | Globale Konfiguration |
| `station_config` | Sender-spezifische Konfiguration |
| `stations` | Sender (für Mehrstation-Betrieb) |
| `musictemplates` | Musikplanungs-Vorlagen |
| `musictemplate_assignment` | Vorlagen-Zuweisung zu Wochentagen/Stunden |
| `templates` | Stundenvorlagen |
| `template_assignment` | Vorlagen-Zuweisung |
| `transitiontemplates` | Übergangs-Vorlagen |
| `transitiontemplate_assignment` | Zuweisung Übergangsvorlagen |
| `folder_config` | Ordner-Konfiguration |

---

## 📊 items

Die zentrale Tabelle. Jede Zeile ist ein Bibliothekselement.

| Spalte | Typ | Beschreibung |
|---|---|---|
| `idx` | INTEGER PK | Interne ID (wird als `internalId` angezeigt) |
| `externalid` | VARCHAR | Externe ID (frei belegbar) |
| `title` | VARCHAR | Titel |
| `artist` | VARCHAR | Interpret |
| `type` | VARCHAR | Typ: `Music`, `Jingle`, `Drop`, `Sweeper`, ... |
| `duration` | REAL | Länge in **Sekunden** (z.B. `155.425`) ✅ bestätigt |
| `totalduration` | REAL | Gesamtlänge inkl. Intro etc. |
| `fadeduration` | REAL | Fade-Dauer |
| `amplification` | REAL | Gain-Wert |
| `pitch` | REAL | Tonhöhen-Anpassung |
| `tempo` | REAL | Tempo-Anpassung |
| `comment` | TEXT | Kommentar/Beschreibung |
| `endtype` | VARCHAR | Segue-Modus |
| `color` | VARCHAR | Farbe (Format noch zu klären) |
| `storage` | INT → storages.idx | Storage-Referenz |
| `filename` | VARCHAR | Relativer Pfad im Storage (z.B. `Louis Tomlinson - Lemonade.mp3`) |
| `level_peak` | REAL | Peak-Lautstärke |
| `level_truepeak` | REAL | True Peak |
| `level_loudness` | REAL | Lautheit (für Normalisierung) |
| `options` | VARCHAR | Weitere Optionen |
| `xmltype` | VARCHAR | Sondertyp für XML-Items (z.B. `File`) |
| `xmldata` | TEXT | XML-Daten für Sonder-Items |
| `created` | TIMESTAMP | Anlage-Zeitstempel |
| `updated` | TIMESTAMP | Letzte Änderung |

---

## 🎚️ item_cuemarkers

Eine Zeile pro Cue-Punkt pro Item. **Kein eindeutiger Primärschlüssel**, Kombination `(item, type)` ist eindeutig.

| Spalte | Typ | Beschreibung |
|---|---|---|
| `item` | INT → items.idx | Item-Referenz |
| `type` | VARCHAR | Cue-Typ (siehe Liste unten) |
| `value` | REAL | Zeit in **Sekunden** ✅ bestätigt |

### Bestätigte Cue-Typen aus der echten DB

```
CueIn       CueOut      FadeIn      FadeOut     FadeEnd
Ramp1       Ramp2       Ramp3
HookIn      HookOut
Outro       StartNext   Preroll
```

> **Nicht in dieser DB gesehen** (aus Doku bekannt): `LoopIn`, `LoopOut`, `HookFade`, `Anchor`

---

## 📁 folders

| Spalte | Typ | Beschreibung |
|---|---|---|
| `idx` | INTEGER PK | Ordner-ID |
| `parent` | INT → folders.idx | Eltern-Ordner (NULL = Wurzel) |
| `name` | VARCHAR | Ordnername |
| `description` | TEXT | Beschreibung |

---

## 📦 storages

| Spalte | Typ | Beschreibung |
|---|---|---|
| `idx` | INTEGER PK | Storage-ID |
| `name` | VARCHAR | Anzeigename |
| `description` | VARCHAR | Beschreibung |
| `defaultLocation` | VARCHAR | Windows-Pfad (z.B. `D:\Audios`) |
| `importfolder` | VARCHAR | Standard-Importordner |

---

## 🗓️ playlist

Stundenbasierte Playlists. Eine Zeile = ein Item in einer Stunde.

| Spalte | Typ | Beschreibung |
|---|---|---|
| `station` | INT → stations.idx | Sender |
| `subplaylist` | INT | Sub-Playlist (für Mehrspur) |
| `slot` | DATETIME | Datum + Stunde: `2026-03-21 08:00:00.000` (Mitternacht: `2026-03-21`) |
| `pos` | INT | Position in der Stunde (0-basiert) |
| `item` | INT → items.idx | Item-Referenz (NULL = leerer Slot) |
| `duration` | REAL | Abspieldauer dieses Eintrags in Sekunden |
| `xmldata` | TEXT | Lokale Overrides als XML (volatile Änderungen) |
| `timing` | VARCHAR | `Soft` (Fix-Zeit-Typ) oder NULL |
| `fixtime` | TIME | Feste Startzeit wenn `timing=Soft` (z.B. `00:00:00.000`) |
| `state` | VARCHAR | Abspiel-Status |
| `starttime` | DATETIME | Tatsächliche Startzeit (wird beim Abspielen gesetzt) |
| `startposition` | REAL | Position beim Start in Sekunden |
| `stoptime` | DATETIME | Tatsächliche Endzeit |
| `uniqueid` | VARCHAR | Eindeutige ID pro Eintrag |

### Slot-Format (wichtig für Backend)

```
Mitternacht:    2026-03-21             (kein Uhrzeitanteil)
Andere Stunden: 2026-03-21 08:00:00.000
```

---

## 🔑 item_attributes

| Spalte | Typ | Beschreibung |
|---|---|---|
| `item` | INT → items.idx | Item-Referenz |
| `name` | VARCHAR | Attribut-Name (z.B. `BPM`, `ISRC`, `Genre`, `Jahr`) |
| `value` | VARCHAR | Wert als String (Zahlen werden als Text gespeichert) |

**Echte Attribut-Namen aus der DB:** `Album`, `Album-Interpret`, `BPM`, `Genre`, `Herausgeber`, `ISRC`, `Jahr`, `Track`

---

## 👥 auth_users

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | INTEGER PK | Benutzer-ID |
| `name` | VARCHAR | Benutzername |
| `description` | VARCHAR | Anzeigename |
| `pw_salt` | VARCHAR | Passwort-Salt |
| `pw_hash` | VARCHAR | Passwort-Hash |
