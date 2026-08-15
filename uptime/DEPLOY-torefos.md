# Deploy på torefos.no (denne maskinen)

## Arkitektur
- UI: `https://torefos.no/uptime/` → nginx → `/var/www/html/uptime/`
- API/WS: nginx proxy → Node `127.0.0.1:8080`
- Cloudflare Tunnel → `localhost:80`

## Tjenester
```bash
sudo systemctl status oppetid
sudo journalctl -u oppetid -f
sudo systemctl restart oppetid
```

## Stier klient bruker (under /uptime)
- `wss://torefos.no/uptime/ws`
- `https://torefos.no/uptime/health`
- `https://torefos.no/uptime/api/tests`

`app.js` setter `KONF.base = '/uptime'` automatisk når path starter med `/uptime`.

## Data
- Historikk: `/var/lib/oppetid/tester.json`

## Nginx
- Locations ligger i `/etc/nginx/sites-available/default`
- Viktig: `proxy_read_timeout 1h` på `/uptime/ws`

## Lokal test uten nginx
```bash
cd /var/www/html/uptime
HOST=0.0.0.0 PORT=8080 SERVE_STATIC=1 node server/server.js
# åpne http://localhost:8080/  (base blir tom, rot-stier)
```
