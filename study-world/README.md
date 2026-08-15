# Tores dag — en levende studieverden

En fullskjerms, «levende» miniatyrverden i nettleseren. Karakteren **Tore** flytter seg
mellom fem isometriske dioramaer etter klokkeslettet, himmelen skifter gjennom døgnet,
og en enkel spiller holder lofi-strømmen i gang mens du studerer.

## Kjør den

```bash
python3 -m http.server 5173 --directory study-world
```

Åpne så `http://localhost:5173`. (Den må serveres over HTTP — ES-moduler og YouTube-
innbyggingen fungerer ikke med `file://`.)

## Legge den ut på nginx

Kopier hele mappa inn i webroten — det er ingen byggesteg, ingen avhengigheter og ingen
absolutte stier. Alt er 116 KB.

```nginx
server {
    listen 443 ssl;
    server_name studie.example.no;

    root /var/www/study-world;
    index index.html;

    # Må ligge inne for at .js skal serveres som application/javascript.
    # ES-moduler avvises av nettleseren med feil MIME-type.
    include /etc/nginx/mime.types;

    # Slipp gjennom innramming fra din egen side.
    add_header Content-Security-Policy "frame-ancestors https://din-side.no" always;
}
```

To fallgruver:

- **Bruk HTTPS.** YouTube-API-et lastes fra `https://www.youtube.com`. Ligger siden på
  `http://`, blokkerer nettleseren det som blandet innhold, og spilleren blir stum.
- **Ikke sett `X-Frame-Options: DENY`/`SAMEORIGIN`** hvis rammen står på et annet domene —
  det overstyrer `frame-ancestors` og gir en tom ramme.

### I en ramme på en annen side

```html
<iframe src="https://studie.example.no/"
        style="width:100%; height:100vh; border:0"
        allow="autoplay; fullscreen"
        title="Tores dag"></iframe>
```

- Siden fyller alltid rammen sin, så rammen må ha en **eksplisitt høyde** — `height:100%`
  på en `<iframe>` uten høyde på foreldrene kollapser til null.
- `allow="autoplay; fullscreen"` trengs for lyden og for fullskjermknappen. Uten
  `fullscreen` skjuler siden knappen selv i stedet for å la den gjøre ingenting.
- Hurtigtastene virker først når rammen har fokus — altså etter ett klikk inni den.
- Blokkerer nettleseren tredjeparts lagring, faller innstillingene tilbake på standard
  for hver økt. Siden starter som normalt.

## Dagsplanen

| Tid | Hva | Hvor |
| --- | --- | --- |
| 22:00–06:00 | Sover | Smååsane, Vennesla |
| 06:00–08:00 | Morgenkaffe | Smååsane, Vennesla |
| 08:00–15:30 | Jobber med nettverksautomasjon | IKT Agder, Kristiansand |
| 15:30–18:00 | Fisker | Venneslafjorden |
| 18:00–22:00 | Studerer | Smååsane, Vennesla |

Planen ligger i `js/config.js`. Legg til, flytt eller del opp perioder der — scenene
kobles på via `ACTIVITIES[...].scene`.

## Om musikken

De fleste kjente 24/7-lofi-kanalene på YouTube — Lofi Girl sin hovedstrøm inkludert —
**tillater ikke innbygging**. De laster fint, melder `onReady`, og feiler først med kode 150
i det du trykker play. Strømmene i `TRACKS` (`js/config.js`) er derfor testet mot
innbyggings-API-et før de ble lagt inn.

Skal du bytte dem ut, test ID-en først — det holder å laste den inn i feltet for egen lenke
i innstillingspanelet. Blir en strøm sperret senere, hopper spilleren automatisk videre til
neste som virker og sier fra i teksten under tittelen.

## Hurtigtaster

| Tast | Handling |
| --- | --- |
| `mellomrom` | spill av / pause |
| `f` | fullskjerm |
| `h` | skjul eller vis tekst-overlegg |
| `s` | innstillinger |

I innstillingspanelet kan du skru av «følg ekte klokkeslett» og skrubbe gjennom hele
døgnet for å se alle scenene, lime inn din egen YouTube-lenke, og justere zoom,
parallakse, partikler og vignett.

## Slik henger koden sammen

| Fil | Ansvar |
| --- | --- |
| `js/config.js` | dagsplan, stedsnavn, spillelister |
| `js/iso.js` | isometrisk projeksjon og 3D-primitiver (flis, boks, sylinder, skygge) |
| `js/character.js` | Tore, tegnet parametrisk fra et skjelett + positurene hans |
| `js/scenes.js` | de fem dioramaene |
| `js/sky.js` | døgnlys: himmelfarger, sol/måne, fargetone over bildet |
| `js/world.js` | lerret, kamera, partikler, overgang mellom scener |
| `js/player.js` | YouTube-spilleren (skjult iframe, kun lyd) |
| `js/main.js` | tid, tilstand, brukerflate og bildeløkka |

Ingenting bygges og ingenting lastes ned — alt er ren HTML, CSS og ES-moduler.
Grafikken tegnes for hånd på et `<canvas>`, så det finnes ingen sprite-filer å vedlikeholde.

### Koordinatsystemet

Alt tegnes i isometriske verdenskoordinater: `x` går ned-høyre på skjermen, `y` ned-venstre,
`z` rett opp. Én flis er 64 × 32 piksler, én høydeenhet er 34 piksler. Rekkefølgen på
tegnekallene *er* dybdesorteringen — bakerst (lav `x + y`) først.

To hjelpere lar deg tegne flatt innhold på en loddrett flate: `faceX` på planet `y = konstant`
(vender ned-venstre — vegger i bakgrunnen, skjermer, vinduer) og `faceY` på planet `x = konstant`
(vender ned-høyre — venstre vegg, whiteboard, serverrack).

### Tore

`drawTore()` bygger ham fra et lite skjelett: hofte, overkropp, hode og fire lemmer med
absolutte vinkler målt fra «rett ned». Positurene i bunnen av `character.js`
(`poseStanding`, `poseCoffee`, `poseTyping`, `poseFishing`, `poseSleeping`) returnerer bare
vinkler, så pusting, tasting og kast er sinuskurver oppå dem. Rekvisitter (kopp, fiskestang)
tegnes via `props`-tilbakekallet, som får hånd-posisjonene.

Utseendet hans ligger samlet i `SKIN` øverst i `character.js`: kort blondt hår, grønne øyne,
blå piqué, beige bukser.

### Stillbilder under utvikling

`window.__cap(bredde, høyde, minutter)` tegner én ramme av scenen som gjelder på det
klokkeslettet og returnerer en PNG som data-URL. Nyttig for å se på kveldsscenen midt på dagen.

## Videre

Naturlige neste steg: flere positurer og småhendelser i hver scene, vær som følger årstiden,
gå-animasjon mellom stedene ved bytte, egne dioramaer for helg kontra hverdag, eller en
studietimer (pomodoro) som Tore reagerer på.
