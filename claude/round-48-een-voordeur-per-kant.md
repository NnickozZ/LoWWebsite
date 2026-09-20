# Ronde 48 — Een voordeur per kant

Nick, ronde 48:

> *"De portaal paginas zijn bij de keeper en bij de spelers hetzelfde, dit moet
> niet. Ook deze moeten los zijn van elkaar."*

Eén migratie (`0030`), één regel in één functie, en een uitzondering op §46 die
uitgeschreven moest worden omdat de regel zelf goed is.

---

## Wat er aan de hand was

Elk overzicht was al netjes per kant gescheiden. De tabel draagt `keeper_only`
sinds §75, `listOverzichten` filtert erop, en een Keeperoverzicht bestaat voor
een speler domweg niet.

Behalve de **voordeur**. `/wiki` gaat langs `getHomeOverzicht`, en dat is een
*opzoeking* — `WHERE is_home = 1`. §46 zegt met zoveel woorden: **een lijst
filtert op kant, een opzoeking nooit.** Die regel is goed en hij is met reden
zo: een Keeper loopt van beide kanten over een touwtje naar één artikel, en dat
artikel moet er dan staan, anders is het archief vanaf de ene kant kapot.

Maar er was precies één rij met `is_home`. Dus las de Keeper op zijn eigen kant
de voorpagina van zijn spelers, en had hij geen plek om te schrijven wat de
tafel niet mag weten.

**Een voordeur is geen touwtje.** Je loopt er niet naartoe, je stáát erop: het
is de pagina van de kant waar je bent. Dat is het hele inzicht van deze ronde,
en het is de reden dat §46 een uitzondering krijgt in plaats van een reparatie.

---

## Wat er gebouwd is

### 1. Twee thuispagina's, één per kant

Migratie `0030_voorpagina_per_kant` zet er één bij met `keeper_only = 1`, een
vaste id (`overzicht-home-keeper`) zodat een latere migratie hem terugvindt, en
een lege tekst. Nick, gevraagd wat erop moest staan: *"een lege, klaar om te
vullen"* — geen kopie van wat de spelers hebben, want die tekst is van hen en
gaat over hun helft van het archief.

De slug is `start-keeper`, want de index op `slug` is uniek. Hij is nergens
zichtbaar — `overzichtHref` geeft `/wiki` voor élke thuispagina — maar hij moet
bestaan.

`INSERT OR IGNORE`, dus draaien op een archief dat hem al heeft doet niets.

### 2. De opzoeking kiest zijn kant

`getHomeOverzicht` draagt nu `sideCondition('overzicht', viewer)` naast de
gewone zichtbaarheidsvraag. Voor een speler doet dat niets (`1 = 1`) en dat
hoeft ook niet: `visibleOverzichtCondition` haalt de Keeperkant er voor hem al
uit (§44), dus wat overblijft is zijn eigen voorpagina en niets anders.

De terugval blijft wat hij was — `/wiki` valt terug op de lijst als er niets is
— en vangt er één geval bij op: een kant die (nog) geen voorpagina heeft.
**Terugvallen op die van de andere kant zou precies de fout zijn die deze ronde
weghaalt**, dus dat gebeurt niet, en er staat een test op.

### 3. De comments die niet meer klopten

De docblock boven `lib/overzichten/service.ts` somde op welke functies
`sideCondition` dragen en welke niet, met `getHomeOverzicht` in de tweede groep
en een goede reden erbij. Die reden is nog steeds goed voor `getOverzicht` en
`getOverzichtBySlug`; voor de voordeur niet. Hij is herschreven in plaats van
blijven staan — §83's les.

---

## Wat er onderweg gevonden is

**Twee, en allebei in de test in plaats van in de code.**

1. **`/keeper` is geen tuimelschakelaar.** Hij brengt je naar de Keeperkant,
   en terug gaat met `/api/keeper/flip?side=player`. De e2e-zaak flipte twee
   keer met `/keeper` en stond dus de tweede keer nog steeds op de Keeperkant —
   waar hij de spelerstekst zocht die daar terecht niet staat. Twee runs
   gekost, en het is §57's "één weg naar de kant" die ik zelf niet gelezen had.
2. **`locator.blur()` is niet het gebaar dat opslaat.** De lead van een
   overzicht slaat op als je ergens anders klikt, precies zoals elk los
   tekstvak in het archief. De zaak die er eerst stond typte en blurde
   programmatisch, en schreef dus niets weg — en faalde daarna op een plek
   twintig regels verderop, wat het er niet makkelijker op maakte. De bestaande
   zaak twee blokken hoger deed het al goed; ik had hem moeten kopiëren in
   plaats van iets nieuws te verzinnen.

Geen van beide is een fout in de app, en dat is op zichzelf het vermelden
waard: de wijziging zelf is klein genoeg dat het meeste werk in het *bewijzen*
zat.

---

## Regels die niet gebroken zijn

1. **§46 staat nog overeind.** `getOverzicht` en `getOverzichtBySlug` filteren
   nog steeds niet op kant, want daar geldt de redenering wél: een Keeper loopt
   er van beide kanten naartoe. Alleen de voordeur is eruit gehaald, met de
   reden erbij.
2. **§44.** Een speler kan de Keepervoorpagina niet zien en niet raden: er is
   geen adres dat hem oplevert, want `/wiki` ís het adres en dat kiest op kant.
3. **§75.** Een overzicht is nog steeds geen rij in `entries`, staat niet in
   het web, niet onder "Genoemd in", niet in een dossier.
4. **Migraties worden aangeplakt en bewaakt.** `0030_` is nieuw en hij raakt
   geen bestaand blok aan.
5. **Een thuispagina kan niet weg.** `deleteOverzicht` weigert er één met
   `is_home`, en dat geldt nu per kant.

---

## Wat er bewust niet in zit

- **Een knop om een voorpagina te maken of te verplaatsen.** `is_home` wordt
  door migraties gezet en door niets anders. Een kant zonder voorpagina valt
  terug op de lijst, en dat is een nette toestand — maar er is vandaag geen
  manier om er zelf één aan te wijzen. Dat is een aparte handeling en hij is
  nergens voor nodig zolang beide kanten er één hebben.
- **Een derde kant.** Er zijn er twee en `keeper_only` is een `boolean`.
- **Een gedeelde voorpagina als optie.** Dat was de oude toestand en het is
  precies wat er weg moest.

---

## Wat er getest is

- `npx tsc --noEmit` stil, ook over `tests/e2e`.
- `npx vitest run` — **1927 tests** over 107 bestanden (was 1925).
- `npm run build` schoon.
- `npx playwright test` — de volledige suite, desktop én telefoon: **441
  geslaagd**, twee rode en allebei bekend: `per-place-crops.spec.ts:13` (§8,
  sinds ronde 19) en `round-28-mention-overlay` op de telefoon, die alleen
  gedraaid groen is — de §6-race, deze ronde nog een keer nagedraaid.
- **`tests/unit/overzicht-spine.test.ts`**: de rugtest telt nu twee
  thuispagina's in plaats van één en eist dat het er **één per kant** zijn (drie
  zou betekenen dat de tabelvolgorde bepaalt welke je krijgt); plus twee nieuwe
  zaken — elke kant krijgt zijn eigen voordeur, en een kant zonder voordeur valt
  terug op niets in plaats van op die van de buren.
- **`tests/e2e/round-38-overzicht.spec.ts`**: de Keeper schrijft op zijn eigen
  voordeur, flipt terug, leest die van de spelers, en een verse speler ziet
  alleen de zijne.

---

## De uitrol

**Er is een migratie**, `0030_voorpagina_per_kant`. Hij draait vanzelf bij het
starten, voegt één rij toe en raakt niets aan wat er staat. Geen verwijderd
bestand.
