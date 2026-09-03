# Deployment — Windows Server

## Voraussetzungen
- Windows Server mit mAirList 6.0 (bereits vorhanden)
- Port 8840 ist für mAirList DB REST reserviert, wird nicht angefasst
- Node.js LTS (18+ oder 20+)
- Python 3.x und Visual Studio Build Tools (C++ Workload) — nötig, damit
  `better-sqlite3` unter Windows aus dem Quellcode kompilieren kann (siehe
  Schritt 1a). Ohne diese schlägt `npm install` im Backend fehl.

## Schritte

### 1. Node.js installieren
Download: https://nodejs.org (LTS Version)
Prüfen: `node --version` in PowerShell

### 1a. Build-Tools für better-sqlite3 installieren
`better-sqlite3` wird beim `npm install` als native Node-Erweiterung
kompiliert. Unter Windows dafür nötig:
- Python 3.x (https://www.python.org, "Add to PATH" beim Setup aktivieren)
- Visual Studio Build Tools mit dem Workload "Desktop development with C++"
  (https://visualstudio.microsoft.com/visual-cpp-build-tools/)

Prüfen: `python --version` in PowerShell. Fehlen die Build Tools, bricht
Schritt 4 (`npm install --production`) mit einem `node-gyp`/`MSBuild`-Fehler ab.

### 2. Repo holen
```powershell
cd C:\
git clone https://github.com/dergabriel/mairlist-webinterface.git
cd mairlist-webinterface
```

### 3. Environment konfigurieren
```powershell
cd server
copy .env.production.example .env
notepad .env
```
DB_PATH auf echte mairlist.mldb anpassen (Content-DB, `.mldb`), z.B.:

```
DB_PATH=C:\mAirList\mairlist.mldb
```

Optional `INITIAL_ADMIN_PASSWORD` setzen, um das Passwort des
Bootstrap-Admin-Accounts selbst vorzugeben (siehe Abschnitt
"Benutzerverwaltung" unten). Wird die Variable leer gelassen, generiert
der Server beim ersten Start ein zufälliges Passwort und schreibt es
einmalig ins Server-Log.

Hinweis: Die Content-DB (`.mldb`, mAirLists Bibliothek/Playlists) und die
Benutzerverwaltung (`server/webinterface-auth.db`, siehe unten) sind zwei
getrennte Datenbanken. mAirLists eigene `auth.db` wird vom Webinterface
nicht mehr verwendet.

### 4. Backend Dependencies
```powershell
npm install --production
```

### 5. Frontend bauen
```powershell
cd ..\frontend
npm install
npm run build
```

### 6. Firewall-Port öffnen
```powershell
New-NetFirewallRule -DisplayName "mAirList Webinterface" -Direction Inbound -LocalPort 8841 -Protocol TCP -Action Allow
```

### 7. Server starten (Test)
```powershell
cd ..\server
node index.js
```
Test im Browser: http://&lt;SERVER-IP&gt;:8841

### 8. Als Dienst einrichten (empfohlen)
```powershell
npm install -g pm2
npm install -g pm2-windows-service
pm2-service-install
pm2 start index.js --name mairlist-webinterface
pm2 save
```

## Benutzerverwaltung (Bootstrap-Admin)
Die Benutzerverwaltung ist unabhängig von mAirList und liegt in einer
eigenen SQLite-Datei `server/webinterface-auth.db`, die beim ersten Start
automatisch angelegt wird. Existiert noch kein Benutzer, wird ein
Admin-Account bootstrapped:
- Passwort aus `INITIAL_ADMIN_PASSWORD` (falls in `.env` gesetzt), sonst
  generiert der Server ein zufälliges Passwort
- Wurde kein `INITIAL_ADMIN_PASSWORD` gesetzt, erscheint das generierte
  Passwort **einmalig im Server-Log** beim ersten Start — Log-Ausgabe
  danach sichern bzw. Passwort sofort ändern
- Fünf Rollen stehen zur Verfügung: `readonly`, `studio`, `dj`, `vtdj`,
  `admin`

## Hinweis: SQLite gleichzeitiger Zugriff
mAirList und das Webinterface greifen auf dieselbe .mldb zu.
Lesevorgänge sind unkritisch. Bei Schreibvorgängen (Item bearbeiten,
Playlist speichern) im Live-Betrieb vorsichtig testen.

## Produktivdeployment — Erfahrungen
Erstes Deployment auf einem Windows Server wurde erfolgreich durchgeführt
und die obigen Schritte in der Praxis verifiziert. Größter Stolperstein
war das Fehlen von Python/Visual Studio Build Tools für die
`better-sqlite3`-Kompilierung (siehe Schritt 1a) — ohne diese bricht
`npm install` im Backend ab.

## Update-Prozess
```powershell
cd C:\mairlist-webinterface
git pull
cd server && npm install --production
cd ..\frontend && npm install && npm run build
pm2 restart mairlist-webinterface
```
