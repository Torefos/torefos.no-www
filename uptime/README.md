# IKT Agder Oppetid

Kontinuerlig måling av nettverksstabilitet mot en internt hostet server. Ingen
pålogging, ingen database, ingen abonnement. Nettleseren måler, serveren husker.

```
nettleser ──► WebSocket-ekko hvert sekund      ─┐
          ──► sideinnlasting av /health hvert 3. sek ─┴──► node-backend ──► JSON-fil
```

**Ingen npm-avhengigheter.** Backend er ren Node.js, inkludert en håndskrevet
WebSocket-implementasjon (RFC 6455). Du trenger bare `node` 18 eller nyere.

---

## Hva du får

* Grønn stolpe for hvert svar, høyden viser svartid på logaritmisk skala 0–1000 ms.
  Stolper over 250 ms blir gule.
* Rød stolpe under nullinjen for hvert tapt kall. Brudd blir dermed synlige på
  én meters avstand, også på en veggskjerm.
* Hold musepekeren over en stolpe for nøyaktig klokkeslett med millisekunder.
* Bruddprotokoll under hver måling: start, slutt og varighet for hvert avbrudd.
* Alle målinger som kjører akkurat nå vises på samme side, uansett hvilken
  maskin de kjører fra. De forsvinner 45 sekunder etter at de stopper.
* Målingen identifiseres av navn pluss en kort tilfeldig kode, for eksempel
  `raadhuset-3etg-k4t9`. Koden ligger i nettleserens `localStorage`, så en
  måling gjenopptas automatisk hvis fanen lukkes og åpnes igjen – og serveren
  skjøter den nye dataen på den gamle.
* Lys og mørk visning, valget huskes.

Poenget med at klienten måler og serveren bare lagrer: når linja faller,
**fortsetter nettleseren å registrere tapte kall lokalt**, og leverer hele køen
når forbindelsen kommer tilbake. Bruddet blir dokumentert, ikke borte.

---

## Innhold

```
ikt-agder-oppetid/
├── public/                    ← statiske filer, serveres av nginx
│   ├── index.html
│   ├── styles.css             ← alle farger ligger øverst her
│   └── app.js
├── server/
│   ├── server.js              ← backend, ingen avhengigheter
│   └── package.json
└── deploy/
    ├── nginx-oppetid.conf
    └── oppetid.service
```

---

## Installasjon

### 1. Legg ut filene

```bash
sudo mkdir -p /var/www/oppetid
sudo unzip ikt-agder-oppetid.zip -d /tmp/
sudo cp -r /tmp/ikt-agder-oppetid/{public,server} /var/www/oppetid/
sudo chown -R www-data:www-data /var/www/oppetid
```

### 2. Start backend

```bash
sudo cp /tmp/ikt-agder-oppetid/deploy/oppetid.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oppetid
sudo systemctl status oppetid
```

### 3. Sett opp nginx

```bash
sudo cp /tmp/ikt-agder-oppetid/deploy/nginx-oppetid.conf /etc/nginx/sites-available/oppetid
sudo nano /etc/nginx/sites-available/oppetid     # bytt server_name
sudo ln -s /etc/nginx/sites-available/oppetid /etc/nginx/sites-enabled/oppetid
sudo nginx -t && sudo systemctl reload nginx
```

**Den viktigste linja i nginx-oppsettet** er `proxy_read_timeout 1h;` på
`/ws`. Standardverdien er 60 sekunder, og da klipper nginx forbindelsen hvert
minutt slik at grafen fylles med brudd som ikke finnes.

### Kjøre lokalt for å prøve det først

```bash
cd ikt-agder-oppetid
HOST=0.0.0.0 PORT=8080 node server/server.js
```

Åpne `http://localhost:8080`. Her serverer backend også de statiske filene, så
du trenger ikke nginx for å teste.

---

## Innstillinger

Backend leser disse miljøvariablene:

| Variabel | Standard | Betydning |
|---|---|---|
| `PORT` | `8080` | lytteport |
| `HOST` | `127.0.0.1` | lytteadresse, sett `0.0.0.0` uten nginx |
| `DATA_FILE` | `server/data/tests.json` | hvor historikken lagres |
| `SERVE_STATIC` | `1` | sett `0` når nginx serverer `public/` |

Måleintervaller og terskler ligger i `KONF` øverst i `public/app.js`:

| Nøkkel | Standard | Betydning |
|---|---|---|
| `wsIntervall` | `1000` | ms mellom ekkokall |
| `wsTidsfrist` | `4000` | ms før kallet regnes som tapt |
| `lastIntervall` | `3000` | ms mellom sideinnlastinger |
| `tregMs` | `250` | svartid som gjør stolpen gul |
| `maksStolper` | `220` | synlige stolper per stripe |

Serverside i toppen av `server/server.js`: `MAX_SAMPLES` (3000 målinger per
type per måling), `ACTIVE_TIMEOUT_MS` (45 s før en måling regnes som stoppet)
og `RETENTION_MS` (7 dagers lagring).

## Farger

Alle profilfargene ligger i `:root` øverst i `public/styles.css`:

```css
--marine: #0a4b66;   /* primær */
--turkis: #00a6b8;   /* aksent */
--marine-lys: #4fbedb;   /* samme to, for mørk visning */
--turkis-lys: #00c9de;
```

Disse er satt etter øyemål mot profilen deres. Bytt de fire verdiene, så
følger hele siden etter i begge visninger. Signalfargene for grønn og rød
ligger rett under og bør stå som de er.

---

## Verdt å vite

**Dette er ikke UDP.** Nettlesere har ikke noe API for rå UDP-pakker, så
målingen går over TCP: WebSocket-rammer og vanlige HTTP-kall. I praksis fanger
det brudd, timeouts og latency-spikes godt, men det skjuler enkeltpakketap som
TCP retransmitterer – du ser dem som en høyere grønn stolpe i stedet for en rød.

Vil du ha ekte UDP fra nettleseren er veien en WebRTC-datakanal satt til
`ordered: false, maxRetransmits: 0`, som kjører SCTP over DTLS over UDP. Det
krever en WebRTC-server i bakkant (Pion for Go, aiortc for Python). Protokollen
mellom nettleser og backend her er bevisst holdt enkel, så en tredje
måletype kan legges til uten å røre resten.

**Belastning.** Hver måling er cirka 1,3 kall i sekundet og noen hundre byte.
Tjue samtidige målinger er ingenting for verken nginx eller Node.

**Ingen pålogging betyr ingen pålogging.** Alle som når siden kan starte og
stoppe egne målinger og se andres. Legg den bak intern DNS eller
`allow`/`deny` i nginx hvis det er ønskelig.
