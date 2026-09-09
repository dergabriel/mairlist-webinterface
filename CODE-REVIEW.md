# Code-Review

Reiner Analyse-Durchgang, Stand 2026-09-09. Keine Code-Änderungen vorgenommen. Geprüft wurden Backend (`server/`), Frontend-Struktur (`frontend/src/`), Dokumentation (`README.md`, `DEPLOYMENT.md`, `SETUP.md`, `docs/*.md`) sowie `package.json` (Backend + Frontend).

---

## Bereich 1: Sicherheit

### 1.1 Echte Server-IP in eingecheckter Beispiel-Konfiguration
**Fundort:** `server/.env.production.example:1,43`
Die Datei enthält als Kommentar und als `ALLOWED_ORIGINS`-Wert die reale Produktions-IP `135.181.214.103:8841` des Windows-Servers. Das ist keine Zugangsdaten-Leckage (kein Passwort/Token), aber eine unnötige Preisgabe privater Infrastruktur-Details in einem öffentlichen GitHub-Repo.
**Einschätzung:** niedrig bis mittel (Aufklärungswert für Angreifer: bekannte IP + offener Port 8841 für Portscans/Bruteforce).
**Vorschlag:** Platzhalter wie `<SERVER-IP>:8841` bzw. `https://radio.example.com` verwenden, wie es in `server/index.js:14` als Beispiel bereits vorgemacht wird.

### 1.2 Keine echten Secrets im Code gefunden
Grep nach typischen Passwort-/Token-/API-Key-Mustern in `.js`/`.md`/`.example`-Dateien lieferte keine Treffer. `.env` selbst ist korrekt in `.gitignore` ausgeschlossen, ebenso `webinterface-auth.db*`, `*.mldb*` und `server/settings.json`. `.env.production.example` enthält nur Platzhalter für Zugangsdaten (`API_DB_USER=`, `API_DB_PASSWORD=`, `INITIAL_ADMIN_PASSWORD=`).
**Einschätzung:** kein Befund / positiv.

### 1.3 Session-Cookie: `secure: false` fest codiert
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
**Vorschlag:** `secure: process.env.COOKIE_SECURE === "true"` o. ä., mit klarer Dokumentation in `DEPLOYMENT.md` Schritt „Als Dienst einrichten“.

### 1.4 Kein Brute-Force-Schutz beim Login
**Fundort:** `server/routes/auth.js:16-41` (`POST /login`)
Es gibt kein Rate-Limiting, keine Verzögerung nach Fehlversuchen und keinen Account-Lockout. Ein Angreifer kann beliebig viele Login-Versuche gegen `admin` fahren. bcrypt (10 Runden, s. u.) bremst zwar pro Versuch, aber ohne Rate-Limit ist verteiltes/paralleles Brute-Forcing möglich.
**Einschätzung:** mittel (kein kritisches Datenleck, aber ein klassischer Login-Endpoint-Fehler, besonders da der Admin-Benutzername `admin` fest vorgegeben ist, s. `server/data/webAuthDb.js:72`).
**Vorschlag:** `express-rate-limit` (oder gleichwertig) auf `/api/auth/login` je IP/Username, z. B. 5 Versuche / 15 Min.

### 1.5 bcrypt-Runden (Cost-Faktor 10)
**Fundort:** `server/data/webAuthDb.js:68, 175, 205`
`bcrypt.hashSync(password, 10)` wird an drei Stellen verwendet (Bootstrap-Admin, `createUser`, `changeUserPassword`). Cost-Faktor 10 ist der bcrypt-Standardwert und für 2026er Hardware inzwischen eher niedrig; 12 gilt heute als gängige Empfehlung für neue Systeme.
**Einschätzung:** niedrig (10 ist nicht unsicher, aber nicht mehr State-of-the-Art).
**Vorschlag:** Auf 12 anheben, ggf. als Konstante extrahieren statt dreimal literal `10`.

### 1.6 Eingabevalidierung in den Routen ist lückenhaft, aber nicht kritisch
**Fundorte:** `server/routes/library.js` (diverse), `server/routes/auth.js`
- Positiv: Alle SQL-Zugriffe in `sqlRepository.js` laufen konsequent über parametrisierte `better-sqlite3`-Prepared-Statements (`db.prepare(...).all(...)`/`.run(...)`), keine String-Konkatenation von Nutzereingaben in SQL gefunden — kein SQL-Injection-Risiko identifiziert.
- Es gibt jedoch kaum Typ-/Format-Validierung auf Body-/Query-Parametern jenseits von "ist vorhanden" (`if (!name || !name.trim())` etc.). Beispiele:
  - `library.js:170-175` (`GET /api/items`): `folderId`, `storageId` werden ungeprüft durchgereicht; in `sqlRepository.js:353-356` landet `Number(filters.storageId)` — bei nicht-numerischem Query-Value wird daraus `NaN`, was zwar keinen Crash, aber ein stillschweigend leeres Ergebnis erzeugt statt eines 400-Fehlers.
  - `library.js:117-152` (Storages-Routen, `requireScope("admin")`): `location`/`path` wird nicht auf Pfad-Validität geprüft, bevor es in `sqlRepository.js:219-226`/`228-239` in `defaultLocation` landet — dieser Wert bestimmt später in `resolveStorageDir()`/`resolveAudioPath()` das Dateisystem-Basisverzeichnis. Da diese Route `admin`-Scope voraussetzt, ist das Risiko durch die Rollenbindung entschärft, aber ein Admin könnte versehentlich (oder ein kompromittierter Admin-Account absichtlich) ein Storage mit `..`-Pfad-Anteilen anlegen.
  - `auth.js:117-128` (`PUT /admin/users/:id/permissions`): `role` wird nicht gegen `webAuthDb.ROLES` validiert, bevor es an `setUserPermissions` geht — dort filtert `ROLES.includes(role)` zwar korrekt (`webAuthDb.js:222`), sodass ein ungültiger Wert nur stillschweigend ignoriert statt einen 400 zurückzugeben.
**Einschätzung:** niedrig bis mittel (kein direktes Sicherheitsloch, eher Robustheits-/UX-Lücke; im admin-geschützten Storage-Fall potenziell relevant für Path-Traversal-Härtung).
**Vorschlag:** Kleine Validierungsschicht (z. B. `zod`/`joi` oder manuelle Guards) für Body-/Query-Parameter vor dem Repository-Aufruf, besonders bei numerischen IDs und Rollen-Strings.

### 1.7 Datei-Upload: Typ/Größe geprüft, aber Extension-Filter ist client-kontrolliert
**Fundort:** `server/routes/library.js:21, 40-51`
`ALLOWED_AUDIO_EXTENSIONS` (`wav/mp3/aac/flac/ogg`) und ein 500-MB-Limit sind über multer korrekt konfiguriert. Der Filter prüft aber nur die Datei-Extension aus `file.originalname` (vom Client gesetzt), nicht den tatsächlichen Datei-Inhalt/MIME-Typ (z. B. Magic Bytes). Ein Angreifer mit `library.write`-Scope könnte eine beliebige Datei mit `.mp3`-Endung hochladen.
**Einschätzung:** niedrig (Upload erfordert bereits Authentifizierung + `library.write`-Scope; Datei landet in einem definierten Storage-Verzeichnis, kein direktes RCE-Risiko ersichtlich, aber potenziell für Speicherplatz-Missbrauch oder falsch deklarierte Inhalte).
**Vorschlag:** Optional Magic-Byte-Prüfung (z. B. `file-type`-Paket) ergänzen, falls das Bedrohungsmodell nicht-vertrauenswürdige `library.write`-Nutzer einschließt.

### 1.8 `apiRepository.js`: Timeouts vorhanden, aber ohne Health-Check-Rückfallebene
**Fundort:** `server/data/apiRepository.js:33, 157-179, 729-741`
Alle Requests an den mAirListDB Server laufen über `REQUEST_TIMEOUT_MS = 10000` mit `AbortController` — sowohl in `doApiRequest()` als auch in `getAudioStream()`. Das ist sauber umgesetzt.
**Einschätzung:** kein Befund / positiv.

### 1.9 SSRF-Risiko bei benutzerdefinierter Hörerzahl-URL
**Fundort:** `server/lib/listenerSource.js:20-30, 51-58`
Der `custom`-Modus der Hörerzahl-Anzeige lässt Admins (`requireScope("admin")` in `library.js:443` für `PUT /api/settings`) eine beliebige `listenerUrl` konfigurieren, die der Server serverseitig per `fetch()` abruft (`fetchJson()`), inklusive eines per `listenerJsonPath` konfigurierbaren Pfads in die Antwort. Es gibt keine Prüfung gegen `localhost`/`127.0.0.1`/private IP-Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) oder Cloud-Metadata-Adressen (`169.254.169.254`). Da die Route bereits `admin`-Scope voraussetzt, ist das Risiko auf böswillige/kompromittierte Admin-Accounts beschränkt, aber es ist ein klassisches SSRF-Muster (Server ruft nutzerkonfigurierte URL ab, Antwort-Inhalt wird zurückgegeben).
**Einschätzung:** mittel (Ausnutzung erfordert Admin-Rechte, aber genau dafür ist der Endpunkt gedacht — kein Zusatzschutz vorhanden).
**Vorschlag:** URL-Validierung vor dem Speichern der Settings: Schema auf `http(s)` beschränken, Hostname gegen private/loopback/link-local-Ranges prüfen (z. B. via `net.isIP` + Range-Check oder eine DNS-Rebinding-resistente Bibliothek).

### 1.10 CORS-Konfiguration
**Fundort:** `server/index.js:13-28`
CORS ist auf `ALLOWED_ORIGINS` (Env-gesteuert) eingeschränkt, mit `credentials: true`. Fehlende Origin (curl/Postman/same-origin) wird pauschal erlaubt — für ein Dev-Setup akzeptabel, in Produktion etwas großzügig, aber da `credentials: true` nur mit explizitem Origin-Header greift, ist das Risiko gering.
**Einschätzung:** niedrig.

### 1.11 Fehlende Security-Header
**Fundort:** `server/index.js` (gesamte Datei)
Kein `helmet` oder manuelle Security-Header (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` etc.). Für eine reine JSON-API mit separat gehostetem Frontend-Build (`express.static`) ist das Risiko begrenzt, aber Standard-Praxis fehlt komplett.
**Einschätzung:** niedrig.
**Vorschlag:** `helmet` mit Standardeinstellungen ergänzen, CSP ggf. anpassen für Audio-Streaming/Inline-Styles.

### 1.12 Abhängigkeiten (`npm audit`)
**Backend (`server/package.json`):**
- `multer` (aktuell `^2.2.0`) — **hoch**: mehrere bekannte DoS-Schwachstellen (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4), Fix verfügbar.
- `express`/`body-parser` — moderat, über transitive `qs`-Abhängigkeit, Fix verfügbar.
- Versionierung: `bcryptjs`, `better-sqlite3`, `cookie-parser`, `cors`, `express`, `multer` sind alle mit `^` (Caret-Range) gepinnt — außer `dotenv`, das bewusst exakt auf `16.4.5` gepinnt ist (siehe `README.md:115-116`, Referenz auf den dotenv-17-Prompt-Injection-Vorfall). Das ist inkonsistent: Wenn die dotenv-Historie als Grund für exaktes Pinning genannt wird, wäre zu überlegen, ob nicht auch die übrigen direkten Abhängigkeiten (insb. `multer`, das gerade aktive CVEs hat) enger gepinnt oder zumindest per Lockfile+CI-Audit überwacht werden sollten. Aktuell verlässt sich das Projekt bei allen anderen Paketen auf Caret-Ranges, was künftige Minor-Updates automatisch zulässt.

**Frontend (`frontend/package.json`):**
- `vite` (`^4.4.9`) — **hoch/moderat**: mehrere bekannte Schwachstellen (Path-Traversal, Dev-Server-Request-Leak), Fix verfügbar nur über Major-Upgrade auf vite 8.
- `esbuild` (transitiv über vite) — moderat.
- Reine Dev-Dependencies (`vite`, `esbuild`, `@vitejs/plugin-react` etc.) betreffen nur die lokale Entwicklungsumgebung, nicht den Produktions-Build selbst — Risiko dadurch eingegrenzt, aber sollte trotzdem aktualisiert werden.

**Einschätzung:** mittel (multer-DoS ist die konkreteste, mit vertretbarem Aufwand behebbare Lücke: `npm audit fix` sollte `multer` ohne Breaking Change auf eine gepatchte Version heben).
**Vorschlag:** `npm audit fix` im Backend ausführen (multer/express/body-parser), vite-Major-Upgrade separat planen (Breaking Changes prüfen), und generell erwägen, sicherheitsrelevante direkte Dependencies (nicht nur dotenv) exakt zu pinnen oder per Dependabot/Renovate + CI-Audit-Gate zu überwachen.

---

## Bereich 2: Dokumentation

### 2.1 `getItemHistory()`-Rückgabeformat weicht zwischen SQL- und API-Repository ab — vom Frontend nur teilweise unterstützt
**Fundort:** `server/data/sqlRepository.js:381-402` vs. `server/data/apiRepository.js:664-685` vs. `frontend/src/pages/ItemEditor.jsx:1218`
- `sqlRepository.js#getItemHistory` gibt `{ slot, date, hour }` zurück.
- `apiRepository.js#getItemHistory` (kommentiert als "mirrors" der API) gibt `{ playedAt, show, moderator }` zurück und weist im Kommentar (`apiRepository.js:668-675`) explizit auf diese Inkonsistenz hin: *"sqlRepository.js's getItemHistory() returns { slot, date, hour } instead, which that same table doesn't read — a pre-existing mismatch in the sqlite path, left alone here"*.
- Das Frontend (`ItemEditor.jsx:1218`) liest `entry.playedAt` — das Feld existiert nur im API-Modus. Im `DATA_SOURCE=sqlite`-Modus (laut `.env.production.example:16` der **Standard-Produktionsmodus**) zeigt die History-Tabelle im Item-Editor daher vermutlich für jeden Eintrag "-" statt eines Datums, weil `playedAt` dort `undefined` ist.
- Der Git-Log zeigt einen Commit `10043d1 fix: getItemHistory liefert playedAt fuer die Verlauf-Tabelle` — das deutet darauf hin, dass dies im API-Pfad bereits behoben wurde, der SQL-Pfad aber laut explizitem Kommentar bewusst unangetastet blieb.
**Einschätzung:** mittel bis kritisch — abhängig davon, ob `sqlite` der tatsächlich genutzte Produktionsmodus ist (laut `.env.production.example` ja). Wenn ja, ist die Verlauf-Tabelle im Item Editor im Produktivbetrieb vermutlich funktional kaputt (zeigt kein Datum an).
**Vorschlag:** `sqlRepository.js#getItemHistory` auf dasselbe `{ playedAt, show, moderator }`-Format ziehen (oder das Frontend auf beide Formate vorbereiten), und den Punkt in `docs/FEATURES.md`/`docs/MAIRLISTDB-API.md` als bekannte Diskrepanz dokumentieren, falls er bewusst offen bleiben soll.

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

1. **`getItemHistory()`-Formatinkonsistenz zwischen SQL- und API-Pfad** (2.1) — im produktiven `sqlite`-Modus zeigt die Verlauf-Tabelle im Item Editor vermutlich kein Datum an, weil `entry.playedAt` dort nie gesetzt wird. Das ist der einzige Befund mit klarem Verdacht auf einen aktiven Funktionsfehler im Standard-Deploy-Modus — sollte zuerst verifiziert und behoben werden.

2. **`multer`-Sicherheitslücken (hoch)** (1.12) — mehrere bekannte DoS-CVEs mit verfügbarem Fix. `npm audit fix` im Backend ist niedrigschwellig und sollte zeitnah laufen.

3. **Kein Brute-Force-Schutz beim Login** (1.4) — einfach nachzurüsten (`express-rate-limit`), schließt eine klassische Lücke auf dem einzigen echten Authentifizierungs-Einstiegspunkt.

4. **SSRF bei benutzerdefinierter Hörerzahl-URL** (1.9) und **`secure: false` im Session-Cookie** (1.3) — beide sind für sich genommen mittleres Risiko, aber leicht behebbar (URL-Validierung bzw. Env-gesteuertes `secure`-Flag) und sollten vor einem TLS-Produktiv-Deploy (Phase H laut README) geschlossen sein.

5. **Reale Server-IP in `server/.env.production.example`** (1.1) — kleine, aber schnell behebbare Infrastruktur-Preisgabe in einer öffentlich einsehbaren Datei; durch Platzhalter ersetzen.

Ergänzend, als niedriger priorisierte, aber sinnvolle Aufräumarbeiten: veraltete TODOs in `repository.js` (2.6), fehlende npm-Skripte für die Smoke-Tests (2.7), und die dokumentierte, aber nicht ausgelagerte Code-Duplizierung zwischen den beiden echten Repositories (3.2).
