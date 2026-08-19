# 🚀 Setup

## Installation

```bash
# Clone the repo
git clone https://github.com/dergabriel/mairlist-web.git
cd mairlist-web

# Backend
cd server
npm install

# Frontend
cd ../frontend
npm install
```

## Development

Zwei Terminal Fenster, jeweils in einem Verzeichnis.

**Terminal 1: Backend (Port 3001)**
```bash
cd server
npm run dev
# oder
npm start
```

**Terminal 2: Frontend (Port 3000)**
```bash
cd frontend
npm run dev
```

Der Browser öffnet sich automatisch auf `http://localhost:3000`.

Das Frontend proxt `/api` Anfragen automatisch zum Backend auf Port 3001 durch (siehe `vite.config.js`).

### Mock vs. Real Repository

**Aktuell:** `repository.js` (In-Memory Mock) ist Standard für Entwicklung
**Produktiv:** `sqlRepository.js` (SQLite via `better-sqlite3`) über `DATA_SOURCE=sqlite` aktivieren

```bash
# Dev (Mock):
npm run dev

# Produktiv (SQLite):
DATA_SOURCE=sqlite npm run dev
```

DB-Pfad über `DB_PATH`, Standard `./mairlist.mldb`. `repository.js` bleibt für Unit-Tests und schnelle Feedback-Schleifen erhalten, wird aber bei `DATA_SOURCE=sqlite` nicht geladen.

## Mit Claude im VS Code Addon weiterarbeiten

Öffne das Projekt Verzeichnis in VS Code, aktiviere das Claude Extension Addon und verwende die `@codebase` Referenz für den Kontext. Gib diese Dateien im Prompt mit, damit Claude konsistent bleibt:

- `DESIGN.md` für den Visual Style
- `README.md` für den Status und die Roadmap
- Das aktuelle Datenmodell aus `server/data/mockData.js`

## Git Push zu GitHub

1. Erstelle ein neues Repo auf GitHub (z.B. `mairlist-web`)
2. Im lokalen Verzeichnis:

```bash
git init
git add .
git commit -m "init: mAirList webinterface mit Backend API und Frontend Struktur"
git branch -M main
git remote add origin https://github.com/dergabriel/mairlist-web.git
git push -u origin main
```

## Struktur

```
mairlist-web/
├── server/                    # Node.js API
│   ├── data/
│   │   ├── mockData.js       # Mock Daten (später SQL)
│   │   └── repository.js     # Datenschicht (später gegen SQL)
│   ├── routes/
│   │   └── library.js        # API Endpunkte
│   ├── index.js
│   └── package.json
├── frontend/                  # React Vite App
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DatabaseManager.jsx
│   │   │   └── ItemEditor.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── DESIGN.md                 # Design System (nicht ändern)
├── README.md                 # Roadmap und Status
└── .gitignore
```
