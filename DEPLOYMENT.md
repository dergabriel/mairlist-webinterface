# Deployment — Windows Server

## Voraussetzungen
- Windows Server mit mAirList 6.0 (bereits vorhanden)
- Port 8840 ist für mAirList DB REST reserviert, wird nicht angefasst
- Node.js LTS (18+ oder 20+)

## Schritte

### 1. Node.js installieren
Download: https://nodejs.org (LTS Version)
Prüfen: `node --version` in PowerShell

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
DB_PATH auf echte mairlist.mldb anpassen, z.B.:

```
DB_PATH=C:\mAirList\mairlist.mldb
```

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
Test im Browser: http://135.181.214.103:8841

### 8. Als Dienst einrichten (empfohlen)
```powershell
npm install -g pm2
npm install -g pm2-windows-service
pm2-service-install
pm2 start index.js --name mairlist-webinterface
pm2 save
```

## Hinweis: SQLite gleichzeitiger Zugriff
mAirList und das Webinterface greifen auf dieselbe .mldb zu.
Lesevorgänge sind unkritisch. Bei Schreibvorgängen (Item bearbeiten,
Playlist speichern) im Live-Betrieb vorsichtig testen.

## Update-Prozess
```powershell
cd C:\mairlist-webinterface
git pull
cd server && npm install --production
cd ..\frontend && npm install && npm run build
pm2 restart mairlist-webinterface
```
