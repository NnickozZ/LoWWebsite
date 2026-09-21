# De sloten — wie wat mag, en wat het bewaakt

§89, ronde 50. Dit is de dreigingstabel: drie soorten lezer, twee soorten
handeling, en per cel het slot en de test die bewijst dat het dicht zit. Een
nieuwe route, pagina of soort ding hoort hier in één oogopslag te passen; past
hij niet, dan mist hij een slot.

## De tabel

| | **Lezen** | **Schrijven** |
|---|---|---|
| **Uitgelogd** | Alleen `/login` en `/signup`. `middleware.ts` stuurt elke andere pagina naar `/login` en geeft elke `/api` een 401. Een vervalst cookie komt langs de middleware en loopt dan tegen `requireViewer()` (elke pagina) of `requireUser()` (elke route) aan. En een query die tóch zonder lezer draait, ziet niets: `null` is `0 = 1`. — *`sloten.test.ts` §1 en §10, `sloten.spec.ts` "a signed-out browser…"* | Inloggen en registreren, met drie emmers (per naam, per adres achter een vertrouwde proxy, en een noodrem), even veel argon2-werk voor een bestaande als een onbekende naam, en geen registratie in een leeg archief (`make bootstrap` maakt de eerste Keeper). Het foutrapport (`/api/client-error`) alleen vanaf de twee deuren, 30 per kwartier, 16 KB. — *`sloten.test.ts` §8/§9, `sloten.spec.ts` "guessing at one name…"* |
| **Speler** | Wat §9 (zichtbaarheid), §17 (de dials) en §44/§46 (de kanten) toestaan — en niets daaromheen: geen versie uit een Keeper-tijdperk (niet in de lijst, niet via `?rev=`), geen `@`-chip die een verborgen naam bevestigt, geen foutmelding die een tabel of kolom noemt. — *`sloten.test.ts` §2, §4, §7; `keeper-leaks.test.ts`, `two-sides.test.ts`* | Alleen via een route of action die zelf zijn recht vraagt (`requireAuthor` + `viewerCanEdit…`), van dezelfde herkomst (`Sec-Fetch-Site`/`Origin`), met een document dat bij binnenkomst wordt schoongemaakt (`cleanDoc`). Geen oude Keeper-versie terugzetten, niet uit de prullenbak halen, niet het karakter van een ander aannemen. — *`sloten.test.ts` §2, §3, §6, §10; `authorship.test.ts`* |
| **Keeper** | Alles. | Alles — behalve het wachtwoord van een andere Keeper zetten of hem uitschakelen (eerst afzetten). Niemand, ook geen Keeper, kan een wachtwoord *lezen*: er is alleen een hash. — *`sloten.test.ts` §9, `sloten.spec.ts` "a Keeper does not set…"* |

## Wat "ook niet via inspect element" betekent

De **code** van Beheer staat, zoals bij elke Next-app, in `/_next/static` en is
voor iedereen met een sessie te downloaden: labels, knopnamen, veldnamen. Dat
is geen lek. Wat beschermd is, is de **data**: geen HTML, geen RSC-payload, geen
JSON-antwoord, geen live-frame en geen Yjs-snapshot bevat iets dat de lezer niet
mag zien (rule 1). De CSP (`next.config.mjs`) zorgt dat een pagina niets laadt
dat niet van het archief komt.

## Wat bewust open staat

- **`'unsafe-inline'` in `script-src`.** Next's bootstrap is inline; een nonce
  vraagt een middleware die elke pagina per request rendert. Een latere ronde.
- **De naam op een caret** komt uit de Yjs-awareness van de browser zelf. Een
  speler kan zijn caret "Keeper" noemen; het wordt als tekst getekend.
- **`by` op een collectie-signaal** zegt welke tab iets veranderde, ook als dat
  iets was dat de lezer niet mag zien. Geen naam, geen id.
- **De hal (`/spelers`, `/api/users`)** toont elke accountnaam aan elke speler.
  Dat is de hal.
- **Een open live-lijn** houdt de rechten waarmee hij geopend werd tot hij
  opnieuw verbindt (ronde 22) — maar elke toetsaanslag vraagt `admit` opnieuw.
- **Geen tweefactor, geen wachtwoord-vergeten-per-mail** (er is geen mail).

## Afhankelijkheden (`npm audit`)

Ronde 50b. **Nooit `npm audit fix --force`** — dat tilt Next, Tiptap, drizzle en
sharp tegelijk een major omhoog (CLAUDE.md §5, 7 september). Per melding:

| Pakket | Ernst | Wat eraan gedaan is |
|---|---|---|
| sharp | hoog | **Opgewaardeerd naar 0.35.4** (libvips/libheif-lekken). sharp leest elke geüploade afbeelding, dus dit was de enige die ertoe deed. |
| @tiptap/core | midden | `__proto__` in attrs wordt een DOM-attribuut; de fix zit alleen in Tiptap 3. **Afgevangen in `cleanDoc`**: elk attrs-object verliest `__proto__`/`constructor`/`prototype` (test in `sloten.test.ts`). |
| drizzle-orm | hoog | SQL-injectie via *identifiers*. Nergens komt gebruikersinvoer in een tabel- of kolomnaam; de ene plek die er één interpoleert (`scripts/restore.mjs`) accepteert sinds 50b alleen tabellen die bestaan. Opwaarderen (0.39 → 0.45) is een eigen ronde. |
| postcss (via next) | hoog | Draait alleen tijdens de build, op onze eigen CSS. Niet bereikbaar. |
| vitest | midden | Alleen de testrunner; draait nooit op de server. |

## Uitrollen

1. `git pull`, `npm ci`, `npm run build` (de migratie draait bij de start).
2. Uit `.env`: `PASSWORD_RECOVERY_KEY` weghalen. `SESSION_SECRET` moet er
   staan en minstens 32 willekeurige tekens zijn (`make dev` maakte er een).
3. Achter nginx: `HOST=127.0.0.1` en `TRUST_PROXY=1` in `.env`, en het
   nginx-blok uit de README (`X-Forwarded-For $remote_addr`, overschrijven).
4. Iedereen logt één keer opnieuw in (de sessies worden voortaan met een HMAC
   opgeslagen, en de migratie gooit de oude weg).
5. **Oude backups** in `data/backups` en elke export-zip die ooit gedeeld is,
   bevatten nog de leesbare wachtwoordkopie. Gooi ze weg zodra de eerste nieuwe
   nachtelijke backup er is; een gedeelde zip beschouw je als gelekt, en de
   spelers in die zip kiezen een nieuw wachtwoord.
