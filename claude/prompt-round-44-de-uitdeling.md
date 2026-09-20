# Prompt — ronde 44: het open grootboek, de uitdeling, en twee grenzen die te strak stonden

**Claims §83.** Repository `D:\LoWWebsite` → github.com/NnickozZ/LoWWebsite (`main`).
Gebouwd bovenop ronde 43 (§82, de winkel).

## Read first, before writing anything

`CLAUDE.md` (§1, §3, §5, §6), dan **`README.md` rules 78, 79, 80 en 82** — 78 is
de grens waarbinnen dit gebouwd wordt, 79 is de kamer, 80 is huisraad en 82 is de
winkel. Dan `claude/round-40-de-kamer.md`, `claude/round-41-huisraad.md` en
`claude/round-43-de-winkel.md`, en `claude/round-39-aanwezig.md` voor §76's regel
over wat je niet mag noemen — die regel is in dit rondje wéér de scherpste.

Dan de code: `lib/kamers/service.ts` en `lib/kamers/shape.ts` (elke docblock),
`lib/entries/fieldValues.ts` (hoe `multiselect` een waarde behandelt),
`lib/db/migrations.mjs` (`0027_kamers`, `0028_huisraad`), `lib/db/seed.mjs`,
`app/(app)/kamer/[slug]/page.tsx`, `app/(app)/winkel/page.tsx` en
`components/kamer/**` + `components/winkel/**`.

## Wat Nick vroeg

> *"Spelers mogen het 'grootboek' ook wel kunnen inzien. Er moet een makkelijke
> 'mass coin distribution' komen voor keepers. dat ze ergens op een simpele knop
> kunnen drukken en dat ze dan gewoon de namen van de spelers invullen en dan
> iedereen x aantal munten geeft omdat ze samen wat gedaan hebben. Een globale
> munten aantal in deze 'gever' en dan per persoon kun je het nog aanpassen. Als
> je het globale nummer weer aanpast dan reset alles naar dat. Je mag best vaker
> hetzelfde ding in je kamer hebben staan. Ik wil dat je sommige items op
> meerdere verschillende plekken mag plaatsen, dus niet limiteren aan slechts 1
> ding als muur, bureau, plank etc"*

Vier dingen, en drie ervan raken dezelfde regels in de kamer. Eén ronde.

## De beslissingen. Niet heropenen.

| Vraag | Antwoord |
|---|---|
| Wie ziet het grootboek | **Iedereen die de kamer mag zien.** Alleen het formulier eronder blijft van de Keeper |
| Wat een uitdeling is | **Eén reden, één knop, één transactie.** Alles lukt of niets lukt |
| Aan wie je uitdeelt | **Aan kamers, en een kamer hoort bij een onderzoeker** — niet bij een speler. Het lijstje leest *Onderzoeker (speler)* |
| Wat het globale getal doet | **Het overschrijft elk bedrag**, ook wat je net zelf hebt getypt. Dat is precies wat Nick vroeg, en het moet zichtbaar gebeuren |
| Wie meedoet | **Een vinkje per regel** (het *wie*) naast een bedrag per regel (het *hoeveel*). Het globale getal raakt de bedragen en nooit de vinkjes |
| Dubbel in een kamer | **Mag**, voor alles wat niet `one_of_a_kind` is. Voor wat dát wél is verandert er niets |
| Meerdere plekken | Het veld `plek` wordt **meerkeuze**. Een ding zonder plek hoort nog steeds nergens |

## 1. Het grootboek gaat open — met een sluier

Vandaag leest `app/(app)/kamer/[slug]/page.tsx` het grootboek alleen als
`room.canGrant`, en dat is de Keeper. Dat moet iedereen worden die de kamer mag
zien — `viewRoomBySlug` heeft die vraag dan al beantwoord, dus de pagina stelt er
geen nieuwe.

**Maar het grootboek is niet zomaar een lijst getallen.** Een regel met
`kind: 'item'` draagt de *naam van het artikel* als reden (`buyFurnishing`
schrijft `entry.name`). Wie de kamer mag zien maar dat artikel niet, zou die naam
via het grootboek alsnog lezen — en dat is exact het lek waar `SlotView.veiled`
voor bestaat (§76, §80). Een plek die zegt *er ligt iets* met drie regels eronder
die zeggen wát, is geen sluier.

Dus: **`ledgerOf` krijgt de kijker erbij.** Een `item`-regel waarvan het artikel
niet door `visibleEntryCondition` komt, komt terug als `veiled: true` en de
component drukt `words.slotVeiled` af in plaats van de naam. Het bedrag blijft
staan: het saldo is al zichtbaar en de plek zegt al dat er iets ligt, dus het
getal vertelt niets nieuws. De variatie zou het lek zijn, niet het getal.

`grant`-regels (de Keeper schreef de reden zelf, vóór de speler) en `slot`-regels
(die drukken een plek-soort af) worden nooit versluierd.

`GrantForm` verhuist achter `canGrant` *in de component*, niet in de pagina — het
grootboek is één ding met een deur eronder die niet voor iedereen opengaat.

## 2. De uitdeling

Een nieuwe pagina `/uitdelen`, Keeper-only, met een deur vanaf het grootboek en
vanaf de kamer. In `lib/live/keys.ts` bij `PAGE_PLACES`, en in `canWatch` een
tak vóór die lijst die `viewer.isKeeper` vraagt — net als `/admin`. Een speler
hoort niet in het lijstje te lezen dat de Keeper staat uit te delen.

**Het scherm.** Eén getal bovenaan (*Iedereen*), één reden, en daaronder één
regel per kamer: een vinkje, de naam *Onderzoeker (speler)*, het huidige saldo,
en een bedrag. Typen in het globale getal zet elk bedrag eronder op dat getal —
ook de bedragen die met de hand zijn aangepast, want dat is wat "dan reset alles
naar dat" betekent. Eén knop onderaan die zegt hoeveel er naar hoeveel kamers
gaat.

**De service: `handOut(rows, reason, viewer)`.**

- Keeper-only, zoals `grant`.
- **Eén transactie.** Als één kamer onder nul zou komen, gaat er niets door en
  noemt de fout die kamer. Een half uitgedeelde beloning is erger dan een
  weigering — de Keeper weet dan niet meer wie wel en wie niet.
- Elke regel is een gewone grootboekregel met `kind: 'grant'` en dezelfde reden.
  Geen nieuwe soort regel, geen nieuwe tabel: een uitdeling *is* een handvol
  grants, en het grootboek hoort ze zo te tonen.
- Bedrag 0, leeg, of vinkje uit → **geen regel**. Die drie manieren om "deze niet"
  te zeggen moeten dezelfde uitkomst hebben, anders vechten ze met elkaar.
- Een negatief bedrag mag, net als bij `grant`: een boete aan tafel is dezelfde
  weg. De bodem op nul geldt per kamer.
- Een kamer die deze Keeper niet bestaat, of een id dat twee keer in de lijst
  staat, is een weigering en geen stilte.

## 3. Dubbel mag

Vandaag weigeren `placeItem` en `buyFurnishing` iets dat al ergens in dezelfde
kamer ligt, óók als het geen `one_of_a_kind` is. Dat moet weg: twee dezelfde
leesstoelen is Nicks bedoeling.

Wat blijft: voor `one_of_a_kind` blijft de vraag aan het **hele archief** gesteld
en blijft de unieke index op `claim` staan. Eén lantaarn is één ding in de
wereld; dat was nooit de regel die te strak stond.

En de lezers moeten meeveranderen, want dit is §17's regel 4 en die is dit hele
project al de terugkerende fout: **`catalogueFor` en `shopFor` mogen niet langer
uitsluiten wat je al hebt**, behalve als het uniek is. Concreet:

- `catalogueFor`: de verzameling `taken` wordt **alleen** de claims. De
  `entry_id`'s uit deze kamer horen er niet meer in — die dekken precies de
  niet-unieke dingen die nu dubbel mogen, en een uniek ding dat hier ligt zit al
  in de claims.
- `shopFor`: `owned` blijft als **label** ("staat al in je kamer") maar zet de
  knop niet meer uit en maakt `landsIn` niet meer `null`. Er komt een veld
  `unique` bij, en alleen `unique && (owned || takenElsewhere)` houdt de knop
  tegen.

## 4. Een ding past op meerdere soorten plek

Het veld `plek` wordt van `select` een **`multiselect`** — het veldsoort bestaat
al (`lib/fieldKinds.ts`, `lib/entries/fieldValues.ts`) en slaat een array op.

**Migratie `0029`, en hij doet twee dingen die bij elkaar horen:**

1. `entry_types.fields`: het veld met sleutel `plek` van `kind: "select"` naar
   `kind: "multiselect"`, voor élke soort die het heeft (`item` en `huisraad`, en
   alles wat Nick er zelf bij maakte). Via `json_each` de index zoeken en
   `json_set` — niet met `replace()` op de tekst, want dan breekt het zodra
   iemand het label heeft hernoemd.
2. `entries.fields`: elke bestaande waarde van `"muur"` naar `["muur"]`, en
   alléén voor artikelen van een soort waarvan het `plek`-veld nu meerkeuze is.
   Een `multiselect` weigert een string bij het opslaan (`fieldValues.ts` geeft
   `undefined` terug), dus zonder deze helft verliest de eerstvolgende bewerking
   van elk voorwerp zijn plek. Het schema en de gegevens veranderen in dezelfde
   migratie of geen van beide.

`lib/db/seed.mjs` krijgt dezelfde velddefinitie — om de reden die ronde 40
ontdekte: op een leeg archief draait de migratie vóór de seed en vindt niets.

**De code die het leest.** Eén helper in `lib/kamers/shape.ts` —
`plekKinds(raw: unknown): PlekKind[]` — die een array leest, **en een losse
string blijft accepteren**. Niet omdat de migratie hem laat staan, maar omdat een
archief dat om wat voor reden dan ook niet gemigreerd is niet stilletjes zijn
kamers moet verliezen. Eén plek waar dat staat, en overal die helper:

- `factsOf` → `plekken: PlekKind[]` in plaats van `plek: PlekKind | null`;
- `plekKindOf` → `plekKindsOf`;
- `placeItem` en `buyFurnishing`: `facts.plekken.includes(slot.kind)`, en
  "hoort nergens in een kamer" blijft de zin voor een lege lijst;
- `catalogueFor`: `plekken.includes(kind)`;
- `shopFor`: `ShopItem.plek` wordt `plekken`, en `landsIn` wordt een vrije plek
  **per soort** — een ding dat aan de muur én op de plank kan, met een volle muur
  en een vrije plank, is aan de muur niet te koop en op de plank wel. Eén
  `landsIn` voor zo'n ding zou de winkel laten liegen.
- `app/(app)/winkel/page.tsx`: de groepen filteren op `plekken.includes(kind)`,
  dus zo'n ding **staat in twee groepen** — dat is wat een etalage per soort plek
  betekent — en de rij krijgt de soort van zijn groep mee.

## Regels die niet gebroken mogen worden

1. **Rule 78 blijft.** Nog steeds geen optelling, geen bonus, geen uitspraak over
   wat mag.
2. **Het saldo blijft de som van het grootboek.** Een uitdeling schrijft regels;
   hij zet geen kolom.
3. **§76: een versluierd ding draagt niets bij en noemt zijn naam niet** — nu ook
   niet in het grootboek.
4. **§17 regel 4: lezers en schrijvers zeggen dezelfde zin.** `catalogueFor` /
   `shopFor` tegenover `placeItem` / `buyFurnishing`, en de winkelknop tegenover
   `buyFurnishing`. Dit rondje verschuift die zin twee keer; allebei de kanten
   moeten mee, en er hoort een regressietest per kant te staan.
5. **§80: een slot heeft ook aan de buitenkant van de deur een gleuf nodig.**
   `/uitdelen` is Keeper-only op de server, in de navigatie én in de gate.
6. **Uniek blijft uniek.** De index op `claim` blijft staan.
7. **Een bestaand veld verandert nooit van sleutel** — dit verandert alleen zijn
   *soort*, en neemt zijn waarden mee.
8. **Alles of niets** bij een uitdeling.

## Bewust buiten scope

Een uitdeling terugdraaien met één knop (een correctie is een regel erbij, §79).
Sjablonen of opgeslagen groepen in de uitdeler. Een geschiedenis van uitdelingen
apart van het grootboek. Huisraad dat ander huisraad uitsluit of vereist. Een
tweede munt. Terugverkopen.

## Wat "groen" betekent

- `tsc --noEmit` stil, `npm run build` schoon, volledige Playwright desktop +
  telefoon (`per-place-crops.spec.ts:13` staat rood op onaangeraakte `main` sinds
  ronde 19 — die is verwacht).
- **Unit** `tests/unit/uitdelen.test.ts` en uitbreidingen op `kamer.test.ts`,
  `huisraad.test.ts` en `winkel.test.ts`, elke rechtenassertie vanaf de kant van
  wie niet mag: een speler die `handOut` aanroept; een uitdeling waarvan één
  regel onder nul zou komen (en dan schrijft er *geen enkele* regel); dubbele
  kamer-id's; een grootboek gelezen door iemand die één van de artikelen niet mag
  zien, vergeleken met hetzelfde grootboek door de ogen van wie het wél mag; twee
  dezelfde stukken huisraad in één kamer (mag) tegenover twee dezelfde voorwerpen
  (mag niet, in dezelfde kamer én in twee kamers); een ding met twee plekken dat
  in beide soorten plek past en in beide winkelgroepen staat; en een `landsIn`
  die per soort plek klopt als de ene soort vol is.
- **e2e** `tests/e2e/uitdelen.spec.ts`: de Keeper deelt uit aan twee kamers met
  één aangepast bedrag, en beide grootboeken tonen de regel met dezelfde reden;
  het globale getal overschrijft een met de hand getypt bedrag; een speler ziet
  zijn eigen grootboek zonder formulier en komt niet op `/uitdelen`. Plus in
  `winkel.spec.ts`: hetzelfde stuk huisraad twee keer kopen in één kamer.
- **En een echte browserronde.** §80 staat er niet voor niets: drie van de vier
  ergste fouten van dit hele project zijn alleen onder een echte hand gevonden.
  Klik de uitdeler, het open grootboek en een ding met twee plekken zelf aan.
- De migratie draait op een leeg archief **en** op een kopie van het echte.

## Als het af is

Schrijf `claude/round-44-de-uitdeling.md` in de huisstijl: wat er gevraagd is, de
beslissingen vooraf, wat er gebouwd is en waarom zó, de fouten die onderweg
gevonden zijn, de regels die niet gebroken mogen worden, wat er bewust niet in
zit, wat er getest is, en de uitrolregel (deze heeft een migratie). Voeg **rule
83** toe aan `README.md` in dezelfde stem als 78–82, en zet de §5-wegwijzer in
`CLAUDE.md` bij.
