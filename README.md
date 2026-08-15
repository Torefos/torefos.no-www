# torefos.no — produksjons-snapshot

Backup og dokumentasjon av statiske (og delvis dynamiske) sider som kjører på **https://torefos.no**.

Dette repoet speiler typisk innholdet under `/var/www/html` på serveren. Det er **ikke** en full server-image: Cloudflare-credentials, TLS-nøkler og live måledata ligger utenfor.

---

## Oversikt over sider

| URL | Mappe i repo | Type | Backend? |
|-----|----------------|------|----------|
| `/` | `index.html` | Lab + **Study**-iframe (default) | Nei |
| `/study-world/` | `study-world/` | Studie-avspiller / dagsverden | Nei (statisk + ES-moduler) |
| `/ecoplan/` | `ecoplan/` | Studentøkonomi | Nei (localStorage i nettleser) |
| `/tshoot/` | `tshoot/` | Nettverksfeilsøkingsflyt | Nei |
| `/uptime/` | `uptime/` | Linjemåling / oppetid | **Ja** — Node.js på `127.0.0.1:8080` |

**Lab-faner** på forsiden (`index.html`): Study (default), Subnet Calculator, OSI, Switch & VLAN, DHCP, DNS, Spanning Tree.

---

## Arkitektur (produksjon)

```
Internett
   │  HTTPS
   ▼
Cloudflare Tunnel (cloudflared)
   │  HTTP → localhost:80
   ▼
nginx (default_server)
   ├─ /                  → /var/www/html/index.html
   ├─ /study-world/      → /var/www/html/study-world/   (+ CSP frame-ancestors)
   ├─ /ecoplan/          → /var/www/html/ecoplan/
   ├─ /tshoot/           → /var/www/html/tshoot/
   └─ /uptime/           → statiske filer
         ├─ /uptime/health  → proxy → Node :8080
         ├─ /uptime/api/    → proxy → Node :8080
         └─ /uptime/ws      → WebSocket proxy → Node :8080
```

### Cloudflare Tunnel

Typisk `config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
origincert: /etc/cloudflared/cert.pem

ingress:
  - hostname: torefos.no
    service: http://localhost:80
  - hostname: www.torefos.no
    service: http://localhost:80
  - service: http_status:404
```

Tjeneste: `cloudflared` (systemd). Credentials **skal ikke** sjekkes inn i Git.

---

## Krav på serveren

| Komponent | Brukes til |
|-----------|------------|
| **nginx** | Statiske filer + reverse proxy for oppetid |
| **cloudflared** | HTTPS / offentlig hostname |
| **Node.js ≥ 18** | Kun `uptime`-backend |
| **systemd** | `oppetid.service` for backend |

```bash
# Eksempel Debian/Raspberry Pi OS
sudo apt install nginx nodejs
# cloudflared installeres etter Cloudflare sin dokumentasjon
```

Sjekk at nginx laster MIME-typer (viktig for ES-moduler i study-world):

```nginx
# I /etc/nginx/nginx.conf under http { ... }
include /etc/nginx/mime.types;
```

`.js` skal serveres som `application/javascript`.

---

## Kataloglayout på server

Anbefalt (som i produksjon):

```text
/var/www/html/                 ← nginx root
  index.html
  study-world/
  ecoplan/
  tshoot/
  uptime/
    public/                    ← kan speile rotfiler for uptime
    server/server.js
    deploy/
/var/lib/oppetid/tester.json   ← måledata (ikke i git)
/etc/nginx/sites-available/default
/etc/systemd/system/oppetid.service
/etc/cloudflared/config.yml
```

Deploy fra dette repoet:

```bash
sudo rsync -a --delete \
  --exclude='.git' \
  --exclude='uptime/server/data/*.json' \
  ./ /var/www/html/
sudo chown -R www-data:www-data /var/www/html
```

---

## Nginx — det som trengs utover «bare filer»

### 1. Vanlige statiske sider

`ecoplan`, `tshoot`, `study-world` og forsiden trenger bare `try_files` mot filer under root. Eksempel:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    root /var/www/html;
    index index.html;
    server_name _;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 2. Study World (iframe på forsiden)

- **Ikke** sett `X-Frame-Options: DENY` (overstyrer CSP og kan gi tom ramme).
- Bruk heller CSP `frame-ancestors` hvis du vil begrense hvem som kan bygge inn:

```nginx
location = /study-world {
    absolute_redirect off;   # bak tunnel: hold Location relativ
    return 301 /study-world/;
}
location /study-world/ {
    try_files $uri $uri/ /study-world/index.html;
    add_header Cache-Control "no-cache" always;
    add_header Content-Security-Policy "frame-ancestors 'self' https://torefos.no https://www.torefos.no" always;
}
```

Forsiden embedder med omtrent:

```html
<iframe
  src="/study-world/"
  allow="autoplay; fullscreen"
  ...
></iframe>
```

Rammen trenger **eksplisitt høyde** i CSS (iframe `height: 100%` uten høyde på foreldre kollapser). Hurtigtaster i study-world virker etter at rammen har fokus (klikk inni).

### 3. Oppetid / linjemåling (`/uptime/`)

Krever **Node-backend** + **WebSocket-proxy** med lang timeout.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# ...

location = /uptime { return 301 /uptime/; }

location /uptime/ {
    add_header Cache-Control "no-cache, must-revalidate" always;
    try_files $uri $uri/ /uptime/index.html;
}

location = /uptime/health {
    proxy_pass http://127.0.0.1:8080/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
}

location /uptime/api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
}

location = /uptime/ws {
    proxy_pass http://127.0.0.1:8080/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Viktig: standard 60s gir falske brudd i grafen
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    proxy_buffering off;
    tcp_nodelay on;
}
```

Klient (`uptime/app.js`) setter `KONF.base = '/uptime'` automatisk når path starter med `/uptime`, og kaller:

- `wss://…/uptime/ws`
- `/uptime/health`
- `/uptime/api/tests` (+ `/export` for historikk)

Uten base-path (lokal `node server.js` på rot) blir base tom.

#### systemd (`oppetid.service`)

Se også `uptime/deploy/oppetid.service`. Produksjonsaktig:

```ini
[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/uptime
ExecStart=/usr/bin/node /var/www/html/uptime/server/server.js
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=DATA_FILE=/var/lib/oppetid/tester.json
Environment=SERVE_STATIC=0
Restart=always
StateDirectory=oppetid
ReadWritePaths=/var/lib/oppetid
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oppetid
sudo systemctl status oppetid
sudo journalctl -u oppetid -f
```

**Node må finnes** (`/usr/bin/node`, typisk pakken `nodejs` ≥ 18).

#### Lokal test av kun oppetid (uten nginx)

```bash
cd uptime
HOST=0.0.0.0 PORT=8080 SERVE_STATIC=1 node server/server.js
# http://localhost:8080/
```

Mer detaljer: `uptime/README.md` og `uptime/DEPLOY-torefos.md`.

---

## Per-site notater

### Forside + lab (`index.html`)

- Ren statisk HTML/CSS/JS.
- Default-fane: **Study** (iframe til `/study-world/`).
- Øvrige faner er lab-verktøy (Subnet Calculator, OSI, VLAN, DHCP, DNS, STP).
- Header-lenker til ecoplan, tshoot, oppetid.

### Study World (`study-world/`)

- Statisk SPA med ES-moduler (`js/main.js` m.m.).
- Krever korrekt `Content-Type` for `.js`.
- Kan åpnes standalone på `/study-world/` eller embeddes på forsiden.
- Se `study-world/README.md` for app-spesifikke detaljer.

### ecoplan (`ecoplan/`)

- 100 % klient: budsjett/sparing i `localStorage`.
- Ingen server-setup utover å servere `index.html`.

### tshoot (`tshoot/`)

- 100 % klient: feilsøkingsflyt + SVG-oversikt + eksport til tekst.
- Ingen backend.

### uptime (`uptime/`)

- Frontend + **Node backend** (ingen npm-avhengigheter).
- WebSocket-ekko + HTTP `/health` + roster `/api/tests` + eksport.
- Data lagres i `DATA_FILE` (produksjon: `/var/lib/oppetid/tester.json`).

---

## Sjekkliste etter installasjon

```bash
# nginx
sudo nginx -t && sudo systemctl reload nginx

# sider
curl -sI http://127.0.0.1/ | head -1
curl -sI http://127.0.0.1/study-world/ | head -5   # ingen X-Frame-Options: DENY
curl -sI http://127.0.0.1/study-world/js/main.js | grep -i content-type
curl -sI http://127.0.0.1/ecoplan/
curl -sI http://127.0.0.1/tshoot/
curl -sI http://127.0.0.1/uptime/

# oppetid backend
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1/uptime/health
curl -s http://127.0.0.1/uptime/api/tests
# WebSocket: DevTools → Network → /uptime/ws → 101 Switching Protocols
```

---

## Synce repo ↔ produksjon

**Fra server til git (backup):**

```bash
rsync -a --delete --exclude='.git' /var/www/html/ ~/repos/torefos.no-www/
cd ~/repos/torefos.no-www
git add -A && git status
git commit -m "Sync production $(date -Iseconds)"
git push
```

**Fra git til server (deploy):** se rsync under «Kataloglayout» over, deretter `chown` og evt. `systemctl restart oppetid` hvis server-kode er endret.

---

## Sikkerhet (kort)

- Oppetid har **ingen innlogging** — alle som når URL-en kan starte målinger og se andres. Vurder IP-filter eller `auth_basic` i nginx ved behov.
- Ikke commit Cloudflare credentials, private nøkler eller live `tester.json`.
- Hold `HOST=127.0.0.1` for Node slik at backend bare er tilgjengelig via nginx (ikke åpen mot internett direkte).

---

## Lisens / eierskap

Personlig prosjekt (torefos.no). Del-apper (f.eks. study-world, oppetid) kan ha egen historikk fra samarbeid med AI-verktøy; dette repoet er samlet produksjons-snapshot for enkel gjenoppretting og dokumentasjon.
