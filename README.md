# mAirList Webinterface

Ein Webinterface für die mAirList Datenbank, das die Funktionen des mAirList Datenbankclients im Browser abbildet. Ziel ist ein Library Browser mit Cue Editor, der plattformunabhängig läuft und keine lokale Installation braucht.

## Warum

Der mAirList Datenbankclient läuft nur unter Windows. Für ein dezentral organisiertes Team ist das ein Problem, besonders wenn Moderatorinnen und Moderatoren mit Mac oder Linux arbeiten. Ein Webinterface löst das:

- Läuft auf Mac, Linux und Windows
- Keine Software Installation am Rechner nötig
- Zugriff von überall, auch remote
- Einfachere Bedienung für Radio Neulinge

## Ausgangslage

Die mAirListDB ist keine Blackbox. Sie läuft auf einem echten SQL Server, unterstützt werden PostgreSQL, MariaDB/MySQL und Microsoft SQL Server. Für Einzelplatz Installationen gibt es alternativ eine lokale Datei mit der Endung `.mldb`. Man kann also direkt gegen die Datenbank arbeiten.

Was fehlt, ist eine offizielle Dokumentation des Schemas. Es gibt keinen dokumentierten Vertrag über Tabellenstruktur und Feldbedeutungen. Genau das muss man sich selbst erarbeiten, und genau darum dreht sich der erste Teil dieses Plans.

Ein vergleichbares Projekt lief 2023 unter dem Namen TubeLive und hatte einen funktionierenden Cue Editor im Browser. Der Sourcecode existiert nicht mehr, das Vorgehen ist aber bekannt und wird hier neu aufgesetzt.

## Stack

- Backend: Node.js, Express
- Frontend: React
- Datenbank: PostgreSQL (bestehende mAirListDB)
- Waveform: wavesurfer.js
- Reverse Proxy: Caddy mit TLS

## Grundregeln

Drei Regeln, die über den Erfolg des Projekts entscheiden.

**Schreiben nur gegen eine Kopie.** Solange nicht bewiesen ist, dass das Datenformat exakt stimmt, wird nie in die produktive Datenbank geschrieben. Ein Fehler beim Rückschreiben korrumpiert Cue Punkte oder Playlists, und das fällt unter Umständen erst on air auf.

**Risiko zuerst testen.** Die Phasen sind so sortiert, dass die riskanteste Annahme früh geprüft wird. Wenn das Rückschreiben scheitert, soll das nach ein paar Tagen klar sein, nicht nach Wochen Frontend Arbeit.

**Jede Phase endet lauffähig.** Am Ende jeder Phase steht etwas Benutzbares oder ein klares Ergebnis. Sonst fallen falsche Annahmen zu spät auf.

## Phasen

### Phase 0, Landkarte

Schema Dump der mAirListDB ziehen und durchgehen. Es geht nur darum zu verstehen, welche Tabellen existieren und wie sie zusammenhängen.

Ergebnis: `SCHEMA.md` mit Tabellen, Spalten, Datentypen und Foreign Keys. Markiert wird, welche Tabellen für Items, Cue Punkte und Playlists relevant sind.

In dieser Phase entsteht kein Code.

### Phase 1, Semantik Doku per Diff

Die wichtigste Phase. Das Schema sagt, dass es eine Spalte für einen Cue Punkt gibt. Es sagt nicht, in welcher Einheit der Wert steht oder wie Fades und Overlaps kodiert sind. Diese Bedeutung wird nicht geraten, sondern von mAirList selbst gezeigt.

Vorgehen pro Feld:

1. Snapshot der Datenbank ziehen
2. In mAirList eine definierte Änderung setzen, zum Beispiel Cue In auf einen bekannten Wert
3. Zweiten Snapshot ziehen
4. Beide Snapshots diffen

Der Diff zeigt exakt, welche Zeile sich wie geändert hat, in welcher Einheit und in welchem Format.

Das wird einmal sauber durchgespielt für:

- Cue In
- Cue Out
- Fade In und Fade Out
- Overlap und Mix Punkte
- Hooks

Ergebnis: `FIELD-SEMANTICS.md`. Das ist das Kronjuwel des Projekts. Ohne diese Datei ist der Cue Editor nicht sauber baubar, mit ihr wird der Rest deutlich einfacher.

Auch hier entsteht noch kein Code, und das ist Absicht.

### Phase 2, Read only Browser

Ab hier wird programmiert. Lesen ist ungefährlich, deshalb läuft diese Phase gegen die echte Datenbank.

Umfang:

- Library Ansicht mit allen Items
- Suche und Filter
- Metadaten Anzeige
- Kategorien

Ergebnis: ein nutzbares Interface, mit dem die Bibliothek von jedem Gerät einsehbar ist. Erster echter Mehrwert im Projekt.

### Phase 3, Der Schreib Beweis

Die Kernphase, und bewusst die kleinste. Genau eine Sache wird gebaut: einen Cue Punkt setzen und in die Kopie der Datenbank schreiben.

Kein Interface nötig, ein Script reicht. Danach wird die Datei in mAirList geöffnet und geprüft, ob der Punkt exakt an der richtigen Stelle sitzt.

Zwei mögliche Ausgänge:

- Es passt. Damit ist bewiesen, dass das Formatverständnis stimmt. Alles Weitere ist Fleißarbeit.
- Es passt nicht. Dann ist früh und billig klar, wo die Wand steht, und es geht zurück in Phase 1.

### Phase 4, Cue Editor

Erst jetzt die Waveform und das Editor Interface.

Umfang:

- Waveform Darstellung mit wavesurfer.js
- Waveform Peaks vorberechnen und ausliefern, nicht ganze Audiofiles streamen, sonst wird die Bedienung zäh
- Marker per Drag setzen
- Fades einstellen
- Speichern gegen die Kopie der Datenbank

Ergebnis: ein funktionierender Cue Editor im Browser.

### Phase 5, Produktivbetrieb

Absicherung und Umstellung auf die echte Datenbank.

Checkliste:

- Backup der produktiven Datenbank
- Authentifizierung im Interface
- Caddy als Reverse Proxy mit TLS
- Eingeschränkter Datenbank User, der nur die Tabellen anfassen darf, die er wirklich braucht
- Schreibzugriff schrittweise freischalten, nicht auf einen Schlag

## Hinweise zum Vibecoding

**Kontext mitgeben.** Eine Datei `CONTEXT.md` anlegen mit Stack, Schema und Feldsemantik und die bei jedem neuen Prompt mitliefern. Ohne diesen Kontext halluziniert das Modell Spaltennamen, die es nicht gibt.

**Schreiboperationen nie ohne Testfall.** Jede generierte Schreiboperation bekommt ein Script dazu, das den geschriebenen Wert direkt wieder ausliest und mit dem Sollwert vergleicht. Bei Cue Punkten zählt Millisekunden Genauigkeit, ungefähr richtig ist falsch.

**Nicht das Frontend ist das Problem.** React und Waveform Handling generiert ein Modell zuverlässig. Der Flaschenhals liegt beim Schema Verständnis und beim korrekten Rückschreiben. Deshalb liegt der Schwerpunkt der frühen Phasen auf Dokumentation und nicht auf Code.

## Zeitrahmen

Grobe Einschätzung, kein Versprechen.

| Phase | Aufwand |
|---|---|
| Phase 0 bis 2 | ein Wochenende |
| Phase 3 | ein Abend, wenn es klappt |
| Phase 4 | ein Wochenende |
| Phase 5 | je nach Anspruch an die Absicherung |

## Status

- [ ] Phase 0, Landkarte
- [ ] Phase 1, Semantik Doku
- [ ] Phase 2, Read only Browser
- [ ] Phase 3, Schreib Beweis
- [ ] Phase 4, Cue Editor
- [ ] Phase 5, Produktivbetrieb
