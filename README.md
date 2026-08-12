# 🎛️ mAirList Webinterface

> Die komplette mAirList Datenbank im Browser. Plattformunabhängig, ohne lokale Installation, mit Datei Upload und Voice Tracking.

![Status](https://img.shields.io/badge/status-planung-yellow)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![Frontend](https://img.shields.io/badge/frontend-React-blue)
![DB](https://img.shields.io/badge/db-PostgreSQL-336791)

---

## 📖 Worum es geht

Der mAirList Datenbankclient läuft nur unter Windows. Für ein dezentral organisiertes Team ist das ein echtes Hindernis, besonders wenn Moderatorinnen und Moderatoren mit Mac oder Linux arbeiten.

Dieses Projekt bildet die Funktionen des mAirList Datenbankclients im Browser ab. Nicht als Fernsteuerung des laufenden Players, sondern als vollwertiger Zugang zur **mAirListDB** selbst, also der Bibliothek, den Metadaten, den Cue Punkten und der Ablaufplanung.

**Vorteile gegenüber dem Windows Client:**

- 🖥️ Läuft auf Mac, Linux und Windows
- 📦 Keine Software Installation am Rechner
- 🌍 Zugriff von überall, auch remote
- 🧑‍🎤 Einfachere Bedienung für Radio Neulinge

---

## 🧩 Ausgangslage

Die mAirListDB ist keine Blackbox. Sie läuft auf einem echten SQL Server, unterstützt werden **PostgreSQL, MariaDB/MySQL und Microsoft SQL Server**. Für Einzelplatz Installationen gibt es alternativ eine lokale Datei mit der Endung `.mldb`. Man kann also direkt gegen die Datenbank arbeiten.

Was fehlt, ist eine offizielle Dokumentation des Schemas. Es gibt keinen dokumentierten Vertrag über Tabellenstruktur und Feldbedeutungen. Genau das muss man sich selbst erarbeiten, und genau darum dreht sich der erste Teil des Fahrplans.

Ein vergleichbares Projekt lief 2023 unter dem Namen **TubeLive** und hatte bereits einen funktionierenden Cue Editor im Browser. Der Sourcecode existiert nicht mehr, das Vorgehen ist aber bekannt und wird hier neu aufgesetzt, diesmal mit KI Unterstützung.

---

## ✨ Funktionsumfang

Ziel ist, den Funktionsumfang des mAirList Datenbankclients im Browser nachzubauen. Die folgende Übersicht zeigt, was der Client kann und in welcher Phase es umgesetzt wird.

### 📚 Bibliothek und Navigation

| Funktion | Beschreibung | Phase |
|---|---|---|
| Bibliotheks Baum | Navigation über Ordner, Artists, Types, Attributes, Storages | 2 |
| Item Liste | Alle Items mit Spalten, sortierbar | 2 |
| Virtuelle Ordner | Items in virtuellen Ordnern organisieren | 4 |
| Item Typen | Audio, Stream, Container, Dummy und weitere | 2 |

### 🔍 Suche

| Funktion | Beschreibung | Phase |
|---|---|---|
| Volltextsuche | Suche über alle Felder | 2 |
| Feldsuche | Suche gezielt nach Artist, Titel und weiteren Feldern | 2 |
| Erweiterte Suche | Mehrere Begriffe kombinieren | 2 |

### 🎚️ Item und Cue Bearbeitung

| Funktion | Beschreibung | Phase |
|---|---|---|
| Metadaten anzeigen | Titel, Artist, Dauer, Attribute lesen | 2 |
| Metadaten bearbeiten | Felder editieren und zurückschreiben | 4 |
| Cue Editor | Cue In, Cue Out, Fades, Overlaps, Hooks setzen | 6 |
| Waveform | Wellenform Darstellung zur Cue Bearbeitung | 6 |
| Item löschen und verschieben | Items verwalten | 4 |

### 📥 Import und Storage

| Funktion | Beschreibung | Phase |
|---|---|---|
| Datei Upload | Audiodatei hochladen, in Storage kopieren, Item anlegen | 5 |
| Auto Cue | Cue Marker beim Import automatisch setzen | 5 |
| Storage Ansicht | Konfigurierte Storages einsehen | 2 |
| Synchronisation | Storage Ordner scannen, neue und fehlende Dateien abgleichen | 5 |

### 🎙️ Voice Tracking

| Funktion | Beschreibung | Phase |
|---|---|---|
| Aufnahme im Browser | Moderation über das Mikrofon aufnehmen | 7 |
| Kontext Monitoring | Enden der umgebenden Songs beim Aufnehmen hören | 7 |
| Einbettung | Voicetrack als Item mit korrekten Overlaps in die Playlist setzen | 7 |

### 📅 Ablaufplanung (optionaler Ausbau)

| Funktion | Beschreibung | Phase |
|---|---|---|
| Geplante Playlists anzeigen | Scheduling Daten lesen | 2 |
| Playlists bearbeiten | Elemente umsortieren und ergänzen | später |
| Reporting | Broadcast Logs und Auswertungen | später |

---

## 🧱 Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** React
- **Datenbank:** PostgreSQL (bestehende mAirListDB)
- **Waveform:** wavesurfer.js
- **Audio Aufnahme:** MediaRecorder API (für Voice Tracking)
- **Reverse Proxy:** Caddy mit TLS

---

## ⚠️ Grundregeln

Drei Regeln, die über den Erfolg des Projekts entscheiden.

> **1. Schreiben nur gegen eine Kopie.**
> Solange nicht bewiesen ist, dass das Datenformat exakt stimmt, wird nie in die produktive Datenbank geschrieben. Ein Fehler beim Rückschreiben korrumpiert Cue Punkte oder Playlists, und das fällt unter Umständen erst on air auf.

> **2. Risiko zuerst testen.**
> Die Phasen sind so sortiert, dass die riskanteste Annahme früh geprüft wird. Wenn das Rückschreiben scheitert, soll das nach ein paar Tagen klar sein, nicht nach Wochen Frontend Arbeit.

> **3. Jede Phase endet lauffähig.**
> Am Ende jeder Phase steht etwas Benutzbares oder ein klares Ergebnis. Sonst fallen falsche Annahmen zu spät auf.

---

## 🗺️ Fahrplan

### 0️⃣ Landkarte

Schema Dump der mAirListDB ziehen und durchgehen. Es geht nur darum zu verstehen, welche Tabellen existieren und wie sie zusammenhängen.

**Ergebnis:** `SCHEMA.md` mit Tabellen, Spalten, Datentypen und Foreign Keys. Markiert wird, welche Tabellen für Items, Cue Punkte, Storages und Playlists relevant sind.

Kein Code in dieser Phase.

### 1️⃣ Semantik Doku per Diff

Die wichtigste Phase. Das Schema sagt, dass es eine Spalte für einen Cue Punkt gibt. Es sagt nicht, in welcher Einheit der Wert steht oder wie Fades und Overlaps kodiert sind. Diese Bedeutung wird nicht geraten, sondern von mAirList selbst gezeigt.

**Vorgehen pro Feld:**

1. Snapshot der Datenbank ziehen
2. In mAirList eine definierte Änderung setzen, zum Beispiel Cue In auf einen bekannten Wert
3. Zweiten Snapshot ziehen
4. Beide Snapshots diffen

Der Diff zeigt exakt, welche Zeile sich wie geändert hat, in welcher Einheit und in welchem Format.

Einmal sauber durchgespielt für: **Cue In, Cue Out, Fade In und Out, Overlap und Mix Punkte, Hooks.**

**Ergebnis:** `FIELD-SEMANTICS.md`. Das ist das Kronjuwel des Projekts. Ohne diese Datei ist der Cue Editor nicht sauber baubar, mit ihr wird der Rest deutlich einfacher.

Ebenfalls noch kein Code, und das ist Absicht.

### 2️⃣ Read only Browser

Ab hier wird programmiert. Lesen ist ungefährlich, deshalb läuft diese Phase gegen die echte Datenbank.

**Umfang:** Bibliotheks Baum, Item Liste, Suche und Filter, Metadaten Anzeige, Storage Ansicht, geplante Playlists anzeigen.

**Ergebnis:** Ein nutzbares Interface, mit dem die komplette Bibliothek von jedem Gerät einsehbar ist. Erster echter Mehrwert im Projekt.

### 3️⃣ Der Schreib Beweis

Die Kernphase, und bewusst die kleinste. Genau eine Sache: einen Cue Punkt setzen und in die Kopie der Datenbank schreiben.

Kein Interface nötig, ein Script reicht. Danach wird die Datei in mAirList geöffnet und geprüft, ob der Punkt exakt an der richtigen Stelle sitzt.

- ✅ **Es passt:** Bewiesen, dass das Formatverständnis stimmt. Alles Weitere ist Fleißarbeit.
- ❌ **Es passt nicht:** Früh und billig klar, wo die Wand steht. Zurück in Phase 1.

### 4️⃣ Metadaten und Item Verwaltung

Die einfacheren Schreibvorgänge, jetzt wo der Schreib Beweis steht.

**Umfang:** Metadaten bearbeiten, virtuelle Ordner verwalten, Items verschieben und löschen.

**Ergebnis:** Die Bibliothek ist nicht mehr nur lesbar, sondern pflegbar.

### 5️⃣ Datei Upload und Import

Der erste Schreibvorgang, der über die reine Datenbank hinausgeht und den Storage berührt.

**Umfang:** Audiodatei über den Browser hochladen, serverseitig in den richtigen Storage Ordner kopieren, Item in der Datenbank anlegen, optional Auto Cue setzen. Dazu die Storage Synchronisation, also Abgleich zwischen Ordner und Datenbank.

**Achtung:** Ab hier wird auch das Dateisystem verändert, nicht nur die Datenbank. Dateipfade und Storage Logik müssen exakt der mAirList Konvention folgen, sonst findet die Software die Datei später nicht.

**Ergebnis:** Neue Musik landet ohne Windows Client in der Bibliothek.

### 6️⃣ Cue Editor

Erst jetzt Waveform und Editor Interface.

**Umfang:** Wellenform mit wavesurfer.js, Waveform Peaks vorberechnen und ausliefern statt ganze Files zu streamen, Marker per Drag setzen, Fades einstellen, Speichern gegen die Kopie.

**Ergebnis:** Ein funktionierender Cue Editor im Browser. Ab hier ist der Stand von TubeLive wieder erreicht.

### 7️⃣ Voice Tracking

Die Königsdisziplin, deshalb ganz am Ende. Voice Tracking ist deutlich komplexer als alles davor, weil drei schwierige Dinge zusammenkommen:

- 🎙️ **Aufnahme im Browser** über die MediaRecorder API, inklusive Mikrofon Zugriff und Pegel
- ⏱️ **Timing** gegen die Enden der umgebenden Songs, damit der Übergang sitzt
- 🧬 **Einbettung** des fertigen Voicetracks als Item mit exakten Overlap Punkten in die geplante Playlist

Jeder dieser Punkte für sich ist machbar, das Zusammenspiel ist der Aufwand. Deshalb kommt Voice Tracking erst, wenn Cue Editor und Datei Upload nachweislich sauber laufen, denn es baut auf beidem auf.

**Ergebnis:** Vollständiges dezentrales Arbeiten, inklusive Moderationen, ohne Windows Client.

### 8️⃣ Produktivbetrieb

Absicherung und Umstellung auf die echte Datenbank.

- 💾 Backup der produktiven Datenbank
- 🔐 Authentifizierung im Interface
- 🌐 Caddy als Reverse Proxy mit TLS
- 👤 Eingeschränkter Datenbank User, der nur die nötigen Tabellen anfassen darf
- 🐢 Schreibzugriff schrittweise freischalten, nicht auf einen Schlag

---

## 🤖 Hinweise zum Vibecoding

**Kontext mitgeben.** Eine Datei `CONTEXT.md` anlegen mit Stack, Schema und Feldsemantik und bei jedem neuen Prompt mitliefern. Ohne diesen Kontext halluziniert das Modell Spaltennamen, die es nicht gibt.

**Schreiboperationen nie ohne Testfall.** Jede generierte Schreiboperation bekommt ein Script dazu, das den geschriebenen Wert direkt wieder ausliest und mit dem Sollwert vergleicht. Bei Cue Punkten zählt Millisekunden Genauigkeit, ungefähr richtig ist falsch.

**Nicht das Frontend ist das Problem.** React und Waveform Handling generiert ein Modell zuverlässig. Der Flaschenhals liegt beim Schema Verständnis und beim korrekten Rückschreiben. Deshalb liegt der Schwerpunkt der frühen Phasen auf Dokumentation, nicht auf Code.

---

## ⏱️ Zeitrahmen

Grobe Einschätzung, kein Versprechen.

| Phase | Aufwand |
|---|---|
| 0 bis 2 (Doku und Read only) | ein Wochenende |
| 3 (Schreib Beweis) | ein Abend, wenn es klappt |
| 4 bis 5 (Metadaten und Upload) | ein bis zwei Wochenenden |
| 6 (Cue Editor) | ein Wochenende |
| 7 (Voice Tracking) | mehrere Wochenenden |
| 8 (Produktiv) | je nach Anspruch an die Absicherung |

---

## ✅ Status

- [ ] 0️⃣ Landkarte
- [ ] 1️⃣ Semantik Doku
- [ ] 2️⃣ Read only Browser
- [ ] 3️⃣ Schreib Beweis
- [ ] 4️⃣ Metadaten und Item Verwaltung
- [ ] 5️⃣ Datei Upload und Import
- [ ] 6️⃣ Cue Editor
- [ ] 7️⃣ Voice Tracking
- [ ] 8️⃣ Produktivbetrieb
