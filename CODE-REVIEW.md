# Code-Review

Reiner Analyse-Durchgang, Stand 2026-09-09. Keine Code-Änderungen vorgenommen. Geprüft wurden Backend (`server/`), Frontend-Struktur (`frontend/src/`), Dokumentation (`README.md`, `DEPLOYMENT.md`, `SETUP.md`, `docs/*.md`) sowie `package.json` (Backend + Frontend).

---

## Bereich 1: Sicherheit

### 1.1 Echte Server-IP in eingecheckter Beispiel-Konfiguration — ✅ behoben (2026-09-09)
**Fundort:** `server/.env.production.example:1,43`
Die Datei enthielt als Kommentar und als `ALLOWED_ORIGINS`-Wert die reale Produktions-IP des Windows-Servers. Das war keine Zugangsdaten-Leckage (kein Passwort/Token), aber eine unnötige Preisgabe privater Infrastruktur-Details in einem öffentlichen GitHub-Repo.
**Einschätzung:** niedrig bis mittel (Aufklärungswert für Angreifer: bekannte IP + offener Port für Portscans/Bruteforce).
**Behoben:** Beide Vorkommen durch den Platzhalter `<SERVER-IP>` ersetzt. Ein Repo-weiter Grep bestätigt, dass die IP in keiner committeten Datei mehr steht. Hinweis: Die IP bleibt in der Git-Historie einsehbar — bei Bedarf wäre ein History-Rewrite nötig.

### 1.2 Keine echten Secrets im Code gefunden
Grep nach typischen Passwort-/Token-/API-Key-Mustern in `.js`/`.md`/`.example`-Dateien lieferte keine Treffer. `.env` selbst ist korrekt in `.gitignore` ausgeschlossen, ebenso `webinterface-auth.db*`, `*.mldb*` und `server/settings.json`. `.env.production.example` enthält nur Platzhalter für Zugangsdaten (`API_DB_USER=`, `API_DB_PASSWORD=`, `INITIAL_ADMIN_PASSWORD=`).
**Einschätzung:** kein Befund / positiv.

### 1.3 Session-Cookie: `secure: false` fest codiert — ✅ behoben (2026-09-09)
**Fundort:** `server/routes/auth.js:32-37`
```js
res.cookie("session", sid, {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  expires: new Date(expiresAt),
});
```
`httpOnly` und `sameSite` sind gesetzt, aber `secure` ist hart auf `false` codiert statt an z. B. `process.env.NODE_ENV === "production"` oder eine eigene Env-Variable gekoppelt zu sein. Bei einem HTTPS-Deploy (Caddy + TLS ist laut `README.md` Phase H geplant) wird das Session-Cookie dadurch weiterhin auch über unverschlüsseltes HTTP übertragen, falls der Reverse Proxy nicht strikt auf HTTPS erzwingt.
**Einschätzung:** mittel (wird relevant, sobald TLS/Caddy in Phase H produktiv geht; aktuell laut `DEPLOYMENT.md` ohne TLS deployt, daher kein akuter Widerspruch, aber ein Stolperstein für später).
**Behoben:** `secure` hängt jetzt an der neuen Env-Variable `COOKIE_SECURE` (Default `false`), dokumentiert in `.env.production.example`. Bewusst nicht an `NODE_ENV` gekoppelt, da das Webinterface produktiv auch über reines HTTP läuft — eine automatische Kopplung hätte dort das Login lahmgelegt. `res.clearCookie()` nutzt dieselben Flags, sonst schlägt das Logout bei `secure: true` fehl.

### 1.4 Kein Brute-Force-Schutz beim Login — ✅ behoben (2026-09-09)
**Fundort:** `server/routes/auth.js:16-41` (`POST /login`)
Es gibt kein Rate-Limiting, keine Verzögerung nach Fehlversuchen und keinen Account-Lockout. Ein Angreifer kann beliebig viele Login-Versuche gegen `admin` fahren. bcrypt (10 Runden, s. u.) bremst zwar pro Versuch, aber ohne Rate-Limit ist verteiltes/paralleles Brute-Forcing möglich.
**Einschätzung:** mittel (kein kritisches Datenleck, aber ein klassischer Login-Endpoint-Fehler, besonders da der Admin-Benutzername `admin` fest vorgegeben ist, s. `server/data/webAuthDb.js:72`).
**Behoben:** In-Memory-Rate-Limiting direkt in `auth.js`, ohne neue Dependency. Gezählt wird getrennt nach Benutzername **und** IP; nach `LOGIN_MAX_ATTEMPTS` (Default 5) Fehlversuchen antwortet die Route für `LOGIN_LOCKOUT_MINUTES` (Default 15) mit HTTP 429. Erfolgreicher Login setzt beide Zähler zurück, abgelaufene Einträge werden beim Zugriff und zusätzlich periodisch aufgeräumt. Beide Werte sind in `.env.production.example` dokumentiert. Die 429-Meldung ist neutral formuliert — verifiziert, dass existierende und nicht existierende Benutzernamen identische Antworten liefern.
**Bewusste Einschränkung:** Die Zähler liegen im Arbeitsspeicher und gehen bei einem Neustart verloren; bei mehreren Instanzen bräuchte es einen gemeinsamen Store. Für die Einzelinstanz akzeptiert, im Code kommentiert.

### 1.5 bcrypt-Runden (Cost-Faktor 10) — ✅ behoben (2026-09-09)
**Fundort:** `server/data/webAuthDb.js:68, 175, 205`
`bcrypt.hashSync(password, 10)` wird an drei Stellen verwendet (Bootstrap-Admin, `createUser`, `changeUserPassword`). Cost-Faktor 10 ist der bcrypt-Standardwert und für 2026er Hardware inzwischen eher niedrig; 12 gilt heute als gängige Empfehlung für neue Systeme.
**Einschätzung:** niedrig (10 ist nicht unsicher, aber nicht mehr State-of-the-Art).
**Behoben:** Als Konstante `BCRYPT_COST = 12` an einer Stelle definiert, alle drei Verwendungen referenzieren sie. Betrifft nur neu gesetzte Passwörter — bestehende Cost-10-Hashes bleiben gültig, da bcrypt den Cost aus dem Hash selbst liest (verifiziert). Kein Migrationsbedarf. Hash-Dauer steigt auf ~420 ms, was für Logins unproblematisch ist und Brute-Force zusätzlich bremst.

### 1.6 ~~Eingabevalidierung in den Routen ist lückenhaft, aber nicht kritisch~~ ✅ behoben
**Fundorte:** `server/routes/library.js` (diverse), `server/routes/auth.js`
- Positiv: Alle SQL-Zugriffe in `sqlRepository.js` laufen konsequent über parametrisierte `better-sqlite3`-Prepared-Statements (`db.prepare(...).all(...)`/`.run(...)`), keine String-Konkatenation von Nutzereingaben in SQL gefunden — kein SQL-Injection-Risiko identifiziert.
- Es gibt jedoch kaum Typ-/Format-Validierung auf Body-/Query-Parametern jenseits von "ist vorhanden" (`if (!name || !name.trim())` etc.). Beispiele:
  - `library.js:170-175` (`GET /api/items`): `folderId`, `storageId` werden ungeprüft durchgereicht; in `sqlRepository.js:353-356` landet `Number(filters.storageId)` — bei nicht-numerischem Query-Value wird daraus `NaN`, was zwar keinen Crash, aber ein stillschweigend leeres Ergebnis erzeugt statt eines 400-Fehlers.
  - `library.js:117-152` (Storages-Routen, `requireScope("admin")`): `location`/`path` wird nicht auf Pfad-Validität geprüft, bevor es in `sqlRepository.js:219-226`/`228-239` in `defaultLocation` landet — dieser Wert bestimmt später in `resolveStorageDir()`/`resolveAudioPath()` das Dateisystem-Basisverzeichnis. Da diese Route `admin`-Scope voraussetzt, ist das Risiko durch die Rollenbindung entschärft, aber ein Admin könnte versehentlich (oder ein kompromittierter Admin-Account absichtlich) ein Storage mit `..`-Pfad-Anteilen anlegen.
  - `auth.js:117-128` (`PUT /admin/users/:id/permissions`): `role` wird nicht gegen `webAuthDb.ROLES` validiert, bevor es an `setUserPermissions` geht — dort filtert `ROLES.includes(role)` zwar korrekt (`webAuthDb.js:222`), sodass ein ungültiger Wert nur stillschweigend ignoriert statt einen 400 zurückzugeben.
**Einschätzung:** niedrig bis mittel (kein direktes Sicherheitsloch, eher Robustheits-/UX-Lücke; im admin-geschützten Storage-Fall potenziell relevant für Path-Traversal-Härtung).
**Vorschlag:** Kleine Validierungsschicht (z. B. `zod`/`joi` oder manuelle Guards) für Body-/Query-Parameter vor dem Repository-Aufruf, besonders bei numerischen IDs und Rollen-Strings.

**Behoben:** Neue Datei `server/lib/validate.js` mit kleinen, lesbaren Guards — bewusst **ohne** zusätzliche Dependency. Sie liefert `requireId`/`optionalId`, `requireDate`/`optionalDate`, `requirePlaylistId`, `optionalCount`, `requirePosition`, `requireText`/`optionalText` sowie `requireObject`/`optionalObject`. Der Helfer `wrapValidation()` verpackt die Handler so, dass ein `ValidationError` als sauberer 400 mit deutscher Meldung beantwortet wird, statt als 500 im globalen Error-Handler zu landen.

Angewendet auf alle Handler in `library.js` und `auth.js`:
- **IDs** werden nur auf "vorhanden, String/Zahl, plausibel kurz" geprüft und *nicht* auf ein Format — die Repositories nutzen unterschiedliche ID-Typen (mock/sqlite numerisch, mAirListDB-API String), eine strengere Prüfung hätte je nach `DATA_SOURCE` legitime Aufrufe abgelehnt. `/api/items/abc/history` liefert deshalb weiterhin 404 ("nicht gefunden"), nicht 400 — es stürzt aber nicht mehr ab.
- **Datum** (`?date=`) und **Playlist-IDs** (`YYYY-MM-DD-HH`) werden per Regex geprüft.
- **`limit`** ist auf max. 500 gedeckelt, `limit`/`offset` müssen nicht-negative Ganzzahlen sein.
- **Freitext** (Titel, Ordnername, Suchbegriff, Filter) ist auf 500 Zeichen begrenzt; Storage-Pfade auf 4000.
- **Bodys** werden vor dem Zugriff als Objekt verifiziert (Arrays und Skalare ⇒ 400).
- **Login** akzeptiert nur noch nicht-leere Strings für `username`/`password` (max. 200 Zeichen) — hält u. a. Objekt-Payloads und sehr große Eingaben vom teuren bcrypt-Vergleich fern. Falsches Passwort bleibt korrekt 401.
- **`role`** wird jetzt in beiden Routen gegen `webAuthDb.ROLES` geprüft und mit 400 abgelehnt, statt still verworfen zu werden (der oben beschriebene Fall).

Bewusst großzügig gehalten, damit nichts Bestehendes bricht: optionale Parameter bleiben optional (fehlend ≠ ungültig), `newParentId: null` und `folderId: null` bleiben erlaubt (Verschieben auf oberste Ebene bzw. aus dem Ordner heraus), und `afterPosition: 0` bleibt gültig ("ganz an den Anfang").

Verifiziert: `smoke-writes.js` weiterhin 12/12 grün; alle Lese- und Schreibrouten gegen einen laufenden Server mit gültigen Anfragen geprüft (unverändert 2xx); kaputte Anfragen (`?date=kaputt`, `?limit=-5`, `?limit=999999`, überlange Freitexte, `order: "nichtarray"`, Array-statt-Objekt-Body, Playlist-ID `nichtsogut`, Position `abc`) liefern jetzt durchweg 400 mit verständlicher Meldung statt Crash oder stillem Fehlverhalten. Der API-Modus (`smoke-reads-api.js`) wurde nicht ausgeführt — dafür fehlt hier eine erreichbare mAirListDB-Server-Instanz.

### 1.7 Datei-Upload: Typ/Größe geprüft, aber Extension-Filter ist client-kontrolliert
**Fundort:** `server/routes/library.js:21, 40-51`
`ALLOWED_AUDIO_EXTENSIONS` (`wav/mp3/aac/flac/ogg`) und ein 500-MB-Limit sind über multer korrekt konfiguriert. Der Filter prüft aber nur die Datei-Extension aus `file.originalname` (vom Client gesetzt), nicht den tatsächlichen Datei-Inhalt/MIME-Typ (z. B. Magic Bytes). Ein Angreifer mit `library.write`-Scope könnte eine beliebige Datei mit `.mp3`-Endung hochladen.
**Einschätzung:** niedrig (Upload erfordert bereits Authentifizierung + `library.write`-Scope; Datei landet in einem definierten Storage-Verzeichnis, kein direktes RCE-Risiko ersichtlich, aber potenziell für Speicherplatz-Missbrauch oder falsch deklarierte Inhalte).
**Vorschlag:** Optional Magic-Byte-Prüfung (z. B. `file-type`-Paket) ergänzen, falls das Bedrohungsmodell nicht-vertrauenswürdige `library.write`-Nutzer einschließt.

### 1.8 `apiRepository.js`: Timeouts vorhanden, aber ohne Health-Check-Rückfallebene
**Fundort:** `server/data/apiRepository.js:33, 157-179, 729-741`
Alle Requests an den mAirListDB Server laufen über `REQUEST_TIMEOUT_MS = 10000` mit `AbortController` — sowohl in `doApiRequest()` als auch in `getAudioStream()`. Das ist sauber umgesetzt.
**Einschätzung:** kein Befund / positiv.

### 1.9 SSRF-Risiko bei benutzerdefinierter Hörerzahl-URL — ✅ behoben (2026-09-09)
**Fundort:** `server/lib/listenerSource.js:20-30, 51-58`
Der `custom`-Modus der Hörerzahl-Anzeige lässt Admins (`requireScope("admin")` in `library.js:443` für `PUT /api/settings`) eine beliebige `listenerUrl` konfigurieren, die der Server serverseitig per `fetch()` abruft (`fetchJson()`), inklusive eines per `listenerJsonPath` konfigurierbaren Pfads in die Antwort. Es gibt keine Prüfung gegen `localhost`/`127.0.0.1`/private IP-Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) oder Cloud-Metadata-Adressen (`169.254.169.254`). Da die Route bereits `admin`-Scope voraussetzt, ist das Risiko auf böswillige/kompromittierte Admin-Accounts beschränkt, aber es ist ein klassisches SSRF-Muster (Server ruft nutzerkonfigurierte URL ab, Antwort-Inhalt wird zurückgegeben).
**Einschätzung:** mittel (Ausnutzung erfordert Admin-Rechte, aber genau dafür ist der Endpunkt gedacht — kein Zusatzschutz vorhanden).
**Behoben:** `assertUrlAllowed()` in `server/lib/listenerSource.js` prüft vor jedem custom-Abruf: nur `http`/`https`, kein `localhost`/`.local`, und — nach DNS-Auflösung — keine Loopback-, privaten oder link-local-Adressen (inkl. Cloud-Metadata `169.254.169.254`), IPv4 wie IPv6. Die Prüfung greift bewusst auf der aufgelösten IP, damit ein Hostname, der auf `127.0.0.1` zeigt, sie nicht umgeht. Nur im `custom`-Modus aktiv; laut.fm bleibt unverändert. Abgelehnte URLs liefern `{ available: false, error }` statt zu crashen. Verifiziert gegen acht Angriffsvarianten (localhost, 127.0.0.1, 169.254.169.254, 192.168.x, 10.x, `file://`, `[::1]`, kaputte URL) — alle blockiert, legitime externe URLs weiterhin erreichbar.
**Rest-Risiko:** Die Prüfung ist nicht vollständig DNS-Rebinding-fest — zwischen Auflösung und dem eigentlichen `fetch()` liegt eine zweite, ungeprüfte Auflösung (TOCTOU). Für ein Admin-Scope-Feature vertretbar; eine harte Absicherung bräuchte einen eigenen Agent, der pro Verbindung die Ziel-IP prüft.

### 1.10 CORS-Konfiguration
**Fundort:** `server/index.js:13-28`
CORS ist auf `ALLOWED_ORIGINS` (Env-gesteuert) eingeschränkt, mit `credentials: true`. Fehlende Origin (curl/Postman/same-origin) wird pauschal erlaubt — für ein Dev-Setup akzeptabel, in Produktion etwas großzügig, aber da `credentials: true` nur mit explizitem Origin-Header greift, ist das Risiko gering.
**Einschätzung:** niedrig.

### 1.11 Fehlende Security-Header
**Fundort:** `server/index.js` (gesamte Datei)
Kein `helmet` oder manuelle Security-Header (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` etc.). Für eine reine JSON-API mit separat gehostetem Frontend-Build (`express.static`) ist das Risiko begrenzt, aber Standard-Praxis fehlt komplett.
**Einschätzung:** niedrig.
**Vorschlag:** `helmet` mit Standardeinstellungen ergänzen, CSP ggf. anpassen für Audio-Streaming/Inline-Styles.

### 1.12 Abhängigkeiten (`npm audit`) — ✅ teilweise behoben (2026-09-09)
**Backend (`server/package.json`):**
- `multer` — ✅ **behoben**: von 2.2.0 auf 2.3.0 gehoben, beseitigt alle vier DoS-CVEs (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4, GHSA-qvfw-j98x-7q72). Kein Breaking Change: die genutzte API (`memoryStorage`, `single()`, `limits`, `fileFilter`) ist unverändert, `library.js` brauchte keine Anpassung. `body-parser` zog dabei auf 1.20.8 nach.
- `qs` (moderat, transitiv über express) — ⚠️ **offen**: Express 4 pinnt `qs` hart auf `~6.15.1`, die gepatchte 6.16.0 liegt außerhalb dieser Range. Ein Fix erfordert entweder Express 5 (Major, Breaking) oder einen erzwungenen `overrides`-Eintrag. Bewusst nicht im Rahmen des Sicherheits-Fixes gemacht. `body-parser` nutzt intern bereits 6.16.0; betroffen ist nur noch Express' eigener Query-Parser.
- Versionierung: `bcryptjs`, `better-sqlite3`, `cookie-parser`, `cors`, `express`, `multer` sind alle mit `^` (Caret-Range) gepinnt — außer `dotenv`, das bewusst exakt auf `16.4.5` gepinnt ist (siehe `README.md:115-116`, Referenz auf den dotenv-17-Prompt-Injection-Vorfall). Das ist inkonsistent: Wenn die dotenv-Historie als Grund für exaktes Pinning genannt wird, wäre zu überlegen, ob nicht auch die übrigen direkten Abhängigkeiten (insb. `multer`, das gerade aktive CVEs hat) enger gepinnt oder zumindest per Lockfile+CI-Audit überwacht werden sollten. Aktuell verlässt sich das Projekt bei allen anderen Paketen auf Caret-Ranges, was künftige Minor-Updates automatisch zulässt.

**Frontend (`frontend/package.json`):**
- `vite` (`^4.4.9`) — **hoch/moderat**: mehrere bekannte Schwachstellen (Path-Traversal, Dev-Server-Request-Leak), Fix verfügbar nur über Major-Upgrade auf vite 8.
- `esbuild` (transitiv über vite) — moderat.
- Reine Dev-Dependencies (`vite`, `esbuild`, `@vitejs/plugin-react` etc.) betreffen nur die lokale Entwicklungsumgebung, nicht den Produktions-Build selbst — Risiko dadurch eingegrenzt, aber sollte trotzdem aktualisiert werden.

**Einschätzung:** mittel — die einzige `high`-Lücke (multer) ist beseitigt; die verbliebenen sind moderat und hängen beide an Major-Upgrades.
**Offene Punkte für einen eigenen Durchgang:**
1. **Express 4 → 5** — löst die `qs`-Lücke. Breaking Changes in Routing/Middleware, braucht einen Test-Durchgang über alle Routen.
2. **Vite 4 → 8** — löst die esbuild-Lücke. Betrifft nur den Dev-Server, nicht den Produktions-Build, daher niedrige Dringlichkeit.
3. **Pinning-Strategie** — nach dem Update wurde geprüft, dass die drei geänderten Pakete (multer, body-parser, qs) keine `preinstall`/`install`/`postinstall`/`prepare`-Scripts mitbringen; Lehre aus dem dotenv-17-Vorfall. Als dauerhafte Absicherung wäre Dependabot/Renovate + CI-Audit-Gate sinnvoller als manuelles Pinning aller Pakete.

---

## Bereich 2: Dokumentation

### 2.1 `getItemHistory()`-Rückgabeformat weicht zwischen SQL- und API-Repository ab — ✅ behoben (2026-09-09)
**Fundort:** `server/data/sqlRepository.js:381-402` vs. `server/data/apiRepository.js:664-685` vs. `frontend/src/pages/ItemEditor.jsx:1218`
- `sqlRepository.js#getItemHistory` gibt `{ slot, date, hour }` zurück.
- `apiRepository.js#getItemHistory` (kommentiert als "mirrors" der API) gibt `{ playedAt, show, moderator }` zurück und weist im Kommentar (`apiRepository.js:668-675`) explizit auf diese Inkonsistenz hin: *"sqlRepository.js's getItemHistory() returns { slot, date, hour } instead, which that same table doesn't read — a pre-existing mismatch in the sqlite path, left alone here"*.
- Das Frontend (`ItemEditor.jsx:1218`) liest `entry.playedAt` — das Feld existiert nur im API-Modus. Im `DATA_SOURCE=sqlite`-Modus (laut `.env.production.example:16` der **Standard-Produktionsmodus**) zeigt die History-Tabelle im Item-Editor daher vermutlich für jeden Eintrag "-" statt eines Datums, weil `playedAt` dort `undefined` ist.
- Der Git-Log zeigt einen Commit `10043d1 fix: getItemHistory liefert playedAt fuer die Verlauf-Tabelle` — das deutet darauf hin, dass dies im API-Pfad bereits behoben wurde, der SQL-Pfad aber laut explizitem Kommentar bewusst unangetastet blieb.
**Einschätzung:** mittel bis kritisch — abhängig davon, ob `sqlite` der tatsächlich genutzte Produktionsmodus ist (laut `.env.production.example` ja). Wenn ja, ist die Verlauf-Tabelle im Item Editor im Produktivbetrieb vermutlich funktional kaputt (zeigt kein Datum an).
**Behoben:** `sqlRepository.js#getItemHistory` liefert jetzt zusätzlich `playedAt`, `show` und `moderator` im Format des API-Repositories. `slot`/`date`/`hour` bleiben erhalten (vorher geprüft: außerhalb dieser Funktion liest sie niemand). Der Verdacht hat sich bestätigt — gegen die Test-DB verifiziert: vor dem Fix war `playedAt` bei allen Einträgen `undefined`, jetzt liefern alle 43 Einträge gültige Datumswerte, Sortierung und Stunden-Verteilung funktionieren.
**Bekannte Einschränkung:** Die `playlist`-Tabelle kennt nur Datum + Stunde, der Zeitstempel ist also stundengenau (Minuten immer `:00`) — anders als im `api`-Modus mit exakter Uhrzeit. Bewusst ohne Zeitzonen-Suffix konstruiert, damit die Stunde beim Parsen im Browser nicht verschoben wird. Im Code kommentiert.

### 2.2 README behauptet DB-Zugriff über "echten SQL Server", tatsächlich läuft SQLite
**Fundort:** `README.md:39` vs. `README.md:41`
Zeile 39: *"Die mAirListDB läuft auf einem echten SQL Server (PostgreSQL, MariaDB/MySQL oder MSSQL). Direkter Datenbankzugriff ist möglich."* Zeile 41 direkt danach: *"Aktueller Modus: echte SQLite-DB."* Das ist für sich genommen nicht falsch (beide Sätze sind im Kontext des größeren mAirList-Ökosystems korrekt gemeint), aber die Abfolge ist verwirrend für Neueinsteiger — der erste Satz suggeriert einen SQL-Server-Zugriff, der zweite widerspricht dem scheinbar sofort. Kein Faktenfehler, aber ein Formulierungs-/Reihenfolgeproblem.
**Einschätzung:** niedrig.
**Vorschlag:** Absatz umstellen: erst den aktuellen SQLite-Modus erklären, dann den optionalen SQL-Server-Direktzugriff als Zukunftsoption/Alternative kennzeichnen.

### 2.3 `docs/FEATURES.md` und `README.md` Phasenstatus wirkt an einigen Stellen optimistischer als der Code
Nicht im Detail verifizierbar ohne vollständigen Abgleich jeder Phase gegen den Code, aber als Hinweis: `README.md:81` (Phase F) listet "Konflikt-Erkennung fehlt noch" bei Mehrbenutzer-Playlists — das ist konsistent mit dem Code (`reorderPlaylist`/`insertPlaylistItem` in beiden Repositories haben keine Versions-/Konflikt-Prüfung außer dem unverifizierten `VersionInfo`-Passthrough in `apiRepository.js:887-898`). Kein Widerspruch gefunden, aber erwähnenswert: Der `VersionInfo`-Mechanismus in `writeHour()` (API-Pfad) wird laut Kommentar (`apiRepository.js:873-875`) nicht auf Konflikte geprüft — passt zur Doku-Aussage "fehlt noch", ist aber im Code selbst nicht explizit als offener Punkt markiert (nur implizit über den Kommentar).
**Einschätzung:** niedrig (Doku und Code stimmen im Kern überein, aber der offene Punkt ist im Code nur als beiläufiger Kommentar sichtbar, nicht als TODO/FIXME).

### 2.4 Fehlende Modul-Dokumentation
**Fundort:** `server/data/repository.js` (Mock-Repository)
Die Datei wurde nicht vollständig gelesen (nicht im Scope der Kern-Prüfung), aber `apiRepository.js` und `sqlRepository.js` sind beide durchgehend sehr gut mit Kommentaren versehen (Header-Kommentare pro Funktion, Begründungen für Design-Entscheidungen). Das ist positiv und über dem Durchschnitt für dieses Projekt — kein negativer Befund hier, eher lobend zu erwähnen.
**Einschätzung:** kein Befund / positiv.

### 2.5 Onboarding: README + DEPLOYMENT.md + SETUP.md sind grundsätzlich ausreichend
`DEPLOYMENT.md` deckt Windows-Deployment inkl. Build-Tools-Fallstricke (`better-sqlite3`-Kompilierung) detailliert ab und wurde laut eigener Aussage ("Produktivdeployment — Erfahrungen", `DEPLOYMENT.md:108-113`) bereits einmal real durchgeführt und verifiziert. Ein Schritt fehlt jedoch:
**Fundort:** `DEPLOYMENT.md:34-55` (Schritt 3, Environment konfigurieren)
Es wird nicht erwähnt, dass beim `DATA_SOURCE=api`-Modus zusätzlich `API_DB_USER`/`API_DB_PASSWORD` gesetzt werden müssen (diese sind in `.env.production.example:23-24` auskommentiert) — wer versucht, direkt mit `api`-Modus zu starten, bekommt keinen Hinweis in `DEPLOYMENT.md`, nur den Kommentar in der `.env`-Datei selbst.
**Einschätzung:** niedrig (Standardmodus ist `sqlite`, `api`-Modus ist laut README noch nicht vollständig — daher nachrangig).
**Vorschlag:** Kurzer Absatz in `DEPLOYMENT.md` für den optionalen `api`-Modus, mit Verweis auf `docs/MAIRLISTDB-API.md`.

### 2.6 Toter/auskommentierter Code
**Fundorte:**
- `server/data/repository.js:322,330,347,362,532,540,548,558,622,694,755,773,789` — durchgehend `TODO: replace with a real SQL ... once the schema is confirmed` Kommentare. Das Schema ist inzwischen längst bestätigt (`docs/SCHEMA.md` existiert, `sqlRepository.js` ist produktiv) — diese Datei ist damit vermutlich das ursprüngliche Mock-Repository und wird nur noch als `DATA_SOURCE` Fallback (`mock`) benutzt. Die TODOs sind über den Punkt hinaus veraltet, an dem sie noch Sinn ergeben (die reale SQL-Implementierung existiert längst parallel in `sqlRepository.js`).
- `server/data/apiRepository.js:1336` — ein weiteres TODO ("Diese Typ-Liste ist unvollständig...") das im Kontext der Funktion nachvollziehbar und noch aktuell ist (kein Dead-Code-Befund, nur zur Vollständigkeit erwähnt).
- `server/data/sqlRepository.js:788-790` — TODO zu `writeHour()`, bewusst als Kompromisslösung dokumentiert (Full-Delete+Reinsert statt gezielter Positions-Verschiebung); nachvollziehbar begründet, kein Handlungsbedarf ohne Kontext zu akuten Problemen.
**Einschätzung:** niedrig (keine Sicherheitsrelevanz, aber Aufräumpotenzial: `repository.js`s TODOs sollten entweder entfernt/umformuliert werden, wenn `mock`-Modus dauerhaft als reiner Test-/Demo-Modus ohne SQL-Ambition bestehen bleibt, oder die Datei klar als "nur für Mock-Zwecke, kein Implementierungsziel mehr" gekennzeichnet werden).

### 2.7 Smoke-Test-Skripte (`server/scripts/*.js`) sind gut dokumentiert, aber nicht in `DEPLOYMENT.md`/`README.md` als CI-Artefakt erwähnt
**Fundort:** `server/scripts/smoke-reads-api.js` (329 Zeilen, sehr sorgfältig geschrieben, mit klaren Assertions und Kommentaren)
Diese Skripte werden im `README.md:43` erwähnt ("19 Smoke-Tests"), aber es gibt keinen `npm script` in `server/package.json`, der sie aufruft (kein `"test"`-Skript definiert). Wer die Smoke-Tests laufen lassen will, muss den `node server/scripts/smoke-reads-api.js`-Aufruf manuell aus dem Kommentar im Dateikopf entnehmen.
**Einschätzung:** niedrig.
**Vorschlag:** `"smoke:reads": "node scripts/smoke-reads-api.js"` etc. als npm-Skripte in `server/package.json` ergänzen.

---

## Bereich 3: Effizienz & Code-Qualität

### 3.1 Weitere N+1-artige Muster über `getPlaylistsByDate` hinaus
**Fundort 1:** `server/data/apiRepository.js:793-806` (`getPlaylistsByDate`)
Wie im Auftrag bereits bekannt: 24 parallele Requests pro Tagesansicht. Der Code kommentiert dies selbst als bewusst in Kauf genommen (`apiRepository.js:787-792`), abgefedert durch den Concurrency-Limiter.

**Fundort 2:** `server/data/apiRepository.js:1194-1197` (`getFolderById`) und `442-448` (`getItemFolders`)
Beide Funktionen laden bei jedem Aufruf **den kompletten Ordnerbaum** (`getFolders()`, laut Kommentar "155-folder tree") neu, nur um eine einzelne ID nachzuschlagen. Wird `getFolderById` mehrfach hintereinander aufgerufen (z. B. `renameFolder`/`moveFolder` rufen es jeweils einmal auf, s. `apiRepository.js:1218-1234`), entstehen mehrere volle Baum-Fetches pro Nutzeraktion statt eines gecachten Zugriffs.

**Fundort 3:** `server/data/sqlRepository.js:141-149` (`getFolderChildren`)
```js
items: itemIds.map((itemId) => getItemById(itemId)).filter(Boolean),
```
Pro Item in einem Ordner wird ein separates `getItemById()` aufgerufen, das intern wiederum 3 zusätzliche Queries ausführt (`item_cuemarkers`, `item_attributes`, `item_folders` — s. `rowToItem()`, `sqlRepository.js:293-336`). Bei einem Ordner mit z. B. 50 Items sind das ~200 Einzel-Queries statt eines gejointen Bulk-Reads. Bei lokalem SQLite-Zugriff ist die Latenz pro Query gering, aber bei größeren Ordnern (Bibliotheken mit tausenden Items) skaliert das nicht gut.

**Fundort 4:** `server/data/apiRepository.js:911-914` (`getRawPlaylistItems`) wird von `reorderPlaylist`, `insertPlaylistItem`, `removePlaylistItem`, `savePlaylistItemOverrides` jeweils einzeln aufgerufen (Read-Modify-Write-Muster), plus `writeHour()` liest die Stunde nochmal für `VersionInfo` (`apiRepository.js:888-889`) — pro Playlist-Schreiboperation also mindestens 2 GET-Requests vor dem eigentlichen PUT. Für Einzelaktionen unkritisch, bei Bulk-Operationen (z. B. mehrere Items nacheinander einfügen) ließe sich das bündeln.

**Einschätzung:** niedrig bis mittel (Performance-Optimierung, kein funktionaler Bug; Relevanz steigt mit Bibliotheksgröße/Nutzerzahl).
**Vorschlag:** Für `getFolderById`/`getItemFolders` einen kurzlebigen In-Memory-Cache des Ordnerbaums pro Request-Zyklus erwägen. Für `getFolderChildren` (SQL-Pfad) einen gejointen Bulk-Query statt N Einzelaufrufen von `getItemById`.

### 3.2 Redundanz zwischen `sqlRepository.js` und `apiRepository.js`
**Fundorte:** `CUE_TO_DB`/`DB_TO_CUE` (`sqlRepository.js:83-89` identisch zu `apiRepository.js:203-209`), `typeToCode()` (`sqlRepository.js:92` identisch zu `apiRepository.js:211`), `parsePlaylistId()` (`sqlRepository.js:110-114` fast identisch zu `apiRepository.js:808-814`), `secondsToClock`/`resequenceEntries`-Logik (`sqlRepository.js:774-785` vs. `apiRepository.js:761-772`, beide Kommentare verweisen explizit aufeinander als "mirrors").
Diese Duplizierung ist an mehreren Stellen im Code selbst als bewusst dokumentiert (z. B. `apiRepository.js:198-201`: "Mirrors sqlRepository.js's..."), vermutlich um die beiden Repositories unabhängig voneinander änderbar zu halten, während `DATA_SOURCE` zwischen ihnen umschaltet. Das ist ein nachvollziehbarer Trade-off, aber bei einer Änderung der Cue-Marker-Namen (`CUE_TO_DB`) müssten beide Dateien synchron gepflegt werden — leicht zu vergessen.
**Einschätzung:** niedrig (architektonische Entscheidung, keine akute Fehlerquelle, aber Wartungsrisiko).
**Vorschlag:** `CUE_TO_DB`/`DB_TO_CUE`, `typeToCode`, `parsePlaylistId` und die Sekunden-zu-Uhrzeit-Konvertierung in ein gemeinsames `server/data/shared.js` (oder ähnlich) auslagern, das beide Repositories importieren — reduziert Drift-Risiko, ohne die Repositories inhaltlich zu koppeln.

### 3.3 `apiRepository.js` ist sehr groß (1476 Zeilen)
**Fundort:** `server/data/apiRepository.js` (gesamte Datei)
Die Datei deckt Items, Folders, Playlists, Audio-Streaming, Attribute-Parsing (XML-Regex), Artists/Titles-Suche und Permissions/Capabilities in einer Datei ab. Sehr gut kommentiert, aber thematisch breit.
**Einschätzung:** niedrig (reine Wartbarkeits-Empfehlung, kein Bug).
**Vorschlag (nicht umzusetzen, nur Empfehlung):** Aufteilung nach Domäne denkbar, z. B. `apiRepository/items.js`, `apiRepository/folders.js`, `apiRepository/playlists.js`, `apiRepository/attributes.js`, mit einem `index.js`, das alles zusammenführt (ähnlich dem bestehenden `module.exports`-Muster). Der gemeinsame `apiRequest()`-Helper (Zeilen 140-196) und die Concurrency-/Retry-Logik (Zeilen 35-104) wären ein natürlicher gemeinsamer Kern.

### 3.4 Frontend: Hooks-Nutzung uneinheitlich
**Fundort:** `frontend/src/pages/ItemEditor.jsx` (größte Datei mit erkennbaren `.map`/`.filter`-Mustern im Komponentenkörper, nutzt aber bereits `useMemo`/`useCallback` an anderer Stelle laut Grep-Treffer)
Eine detaillierte Zeile-für-Zeile-Prüfung aller Berechnungen war im gegebenen Rahmen nicht vollständig möglich (Datei wurde nicht komplett gelesen). Der Umstand, dass `historyStats.js` bereits gezielt für Performance gefixt wurde (s. Git-Historie/Auftrag), deutet aber darauf hin, dass ähnliche Stellen in `ItemEditor.jsx` (Cue-Marker-Listen, Attribut-Listen) noch nicht durchgängig auf `useMemo` geprüft wurden.
**Einschätzung:** niedrig (nicht abschließend verifiziert, als Hinweis für eine gezielte Folgeprüfung markiert statt als bestätigter Befund).
**Vorschlag:** Gezielte Nachprüfung von `ItemEditor.jsx`, `Playlist.jsx` und `MixEditor.jsx` auf teure Re-Renders (z. B. Sortier-/Filterlisten bei jedem Tastendruck im Suchfeld) mit React DevTools Profiler.

### 3.5 Fehlerbehandlung im Backend: konsistent, ein Ausreißer
**Fundorte:** `server/routes/library.js`, `server/routes/auth.js` (alle Handler)
Fast alle Routen-Handler folgen konsequent dem Muster `try { ... } catch (e) { next(e); }`, das zentral in `server/index.js:55-59` behandelt wird (inkl. sinnvoller Status-Codes über `err.status`). Ein Ausreißer:
**Fundort:** `server/routes/library.js:327-341` (`POST /api/upload`)
```js
router.post("/upload", requireScope("library.write"), (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    ...
    try {
      const item = repo.uploadFile(...);
      ...
    } catch (e) { next(e); }
  });
});
```
Hier wird der multer-Fehler direkt mit hartem `400` beantwortet statt über `next(e)` zu laufen — das ist funktional plausibel (multer-Fehler sind praktisch immer Client-Fehler: Dateigröße/Typ), aber inkonsistent mit dem sonst durchgängigen `next(e)`-Muster und geht am zentralen Error-Handler/Logging vorbei (kein `console.error`-Log für fehlgeschlagene Uploads).
**Einschätzung:** niedrig.
**Vorschlag:** Auch hier `next(err)` verwenden und ggf. `err.status = 400` vor dem Werfen setzen, damit der zentrale Handler greift und loggt.

---

## Zusammenfassung: Die 5 wichtigsten Punkte zum Anfangen

**Stand 2026-09-09:** Alle fünf ursprünglichen Prioritäten sind in zwei gezielten Durchgängen abgearbeitet (je ein Commit pro Punkt):

1. ~~**`getItemHistory()`-Formatinkonsistenz zwischen SQL- und API-Pfad** (2.1)~~ — ✅ behoben. Der Verdacht hat sich bestätigt: im `sqlite`-Modus war die Verlauf-Ansicht tatsächlich leer. `playedAt` wird jetzt auch dort gesetzt.

2. ~~**`multer`-Sicherheitslücken (hoch)** (1.12)~~ — ✅ behoben: multer 2.2.0 → 2.3.0. Verbleibend nur noch die moderate `qs`-Lücke, die an einem Express-5-Upgrade hängt.

3. ~~**Kein Brute-Force-Schutz beim Login** (1.4)~~ — ✅ behoben: In-Memory-Rate-Limiting nach Benutzername und IP, konfigurierbar per Env.

4. ~~**SSRF bei benutzerdefinierter Hörerzahl-URL** (1.9) und **`secure: false` im Session-Cookie** (1.3)~~ — ✅ beide behoben: URL-Validierung mit DNS-Auflösung bzw. `COOKIE_SECURE`-Env-Variable. Für den TLS-Deploy (Phase H) ist damit nur noch `COOKIE_SECURE=true` zu setzen.

5. ~~**Reale Server-IP in `server/.env.production.example`** (1.1)~~ — ✅ behoben, durch `<SERVER-IP>` ersetzt. Hinweis: in der Git-Historie weiterhin einsehbar.

Ebenfalls erledigt: bcrypt-Cost 10 → 12 (1.5).

### Nächste sinnvolle Schritte

Da die ursprüngliche Top-5-Liste abgearbeitet ist, rücken diese Punkte nach vorn:

1. **Upload-Validierung nur über die Datei-Extension** (1.7) — der Typ-Filter prüft `originalname`, nicht den Inhalt. Der derzeit gewichtigste offene Sicherheitspunkt.
2. **Fehlende Security-Header** (1.11) — niedrigschwellig. (~~Eingabevalidierung in den Routen, 1.6~~ — ✅ behoben, siehe oben.)
3. **Express 4 → 5** (1.12) — schließt die letzte gemeldete Backend-Lücke (`qs`), braucht aber einen Test-Durchgang über alle Routen.
4. Aufräumarbeiten: veraltete TODOs in `repository.js` (2.6), fehlende npm-Skripte für die Smoke-Tests (2.7), Code-Duplizierung zwischen den beiden echten Repositories (3.2).
