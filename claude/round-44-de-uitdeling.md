# Ronde 44 — het open grootboek, de uitdeling, en twee grenzen die te strak stonden

**Claims §83 / rule 83.** Gebouwd op ronde 43 (§82, de winkel).
Migratie: **`0029_meerdere_plekken`** — zie *De uitrol* onderaan.

## Wat er gevraagd is

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

## De beslissingen vooraf

| Vraag | Antwoord |
|---|---|
| Wie ziet het grootboek | Iedereen die de kamer mag zien. Alleen het formulier eronder blijft van de Keeper |
| Wat een uitdeling is | Eén reden, één knop, **één transactie**. Alles of niets |
| Aan wie je uitdeelt | Aan **kamers**, en een kamer hoort bij een onderzoeker — het lijstje leest *Onderzoeker (speler)* |
| Wat het globale getal doet | Het overschrijft élk bedrag, ook wat net met de hand getypt is |
| Wie meedoet | Een vinkje per regel (het *wie*) naast het bedrag (het *hoeveel*). Het globale getal raakt alleen bedragen |
| Dubbel in een kamer | Mag, voor alles wat niet `one_of_a_kind` is |
| Meerdere plekken | `plek` wordt een meerkeuze. Een ding zonder plek hoort nog steeds nergens |

## Eén ding waar jouw zin en het archief uit elkaar lopen

Je vroeg om **"de namen van de spelers"**. Een beurs hoort bij een
**onderzoeker**, niet bij een speler: de kamer hangt aan het artikel van het
karakter (§79). Wie er twee draagt heeft er dus twee, en een scherm dat mensen
opsomde zou er stilletjes één van moeten kiezen — en de helft van de tijd de
verkeerde.

Het lijstje is daarom van kamers, en elke regel leest **"Onderzoeker (speler)"**.
De naam die je zocht staat er gewoon, en wat je aanvinkt is het ding dat munten
houdt. Als je dit anders wilt — bijvoorbeeld één regel per speler met een
keuzemenu erachter — is dat een kleine aanpassing, maar hij moet ergens die
keuze maken en dat kun jij beter doen dan het scherm.

## Wat er gebouwd is

### 1. Het grootboek ligt open — met een sluier

`app/(app)/kamer/[slug]/page.tsx` las het grootboek alleen voor een Keeper. Nu
leest iedereen die de kamer mag zien het, en het onderscheid woont in
`components/kamer/Grootboek.tsx` zelf (`canGrant`): de lijst en de deur eronder
zijn één ding, en een pagina die de ene zonder de andere moest doorgeven is een
pagina die het vergeet.

**En er moest een sluier mee.** Een regel met `kind: 'item'` draagt de *naam* van
het artikel dat gekocht is (`buyFurnishing` schrijft `entry.name`). Wie in de
kamer mag staan maar dat ding niet mag zien, las die naam anders alsnog — precies
het lek waar de versluierde plek voor bestaat (§76, §79). `ledgerOf` krijgt
daarom de kijker erbij en zo'n regel komt terug met `veiled: true`; het scherm
drukt dan `words.slotVeiled` af — **dezelfde zin als de plek zelf**, want de
variatie zou het lek zijn.

Het **bedrag** blijft staan. Het saldo staat al boven aan de pagina en de plek
zegt al dat er iets ligt, dus het getal vertelt niets nieuws — en een regel die
verdween zou zelf de verklapper zijn. `grant`-regels (jouw eigen woorden, voor de
speler geschreven) en `slot`-regels worden nooit versluierd.

### 2. `/uitdelen`

Eén getal bovenaan (*Iedereen*), één reden, en daaronder één regel per kamer: een
vinkje, *Onderzoeker (speler)*, het huidige saldo, en een bedrag. De knop zegt
hoeveel er naar hoeveel kamers gaat.

- **Het globale getal overschrijft alles eronder**, ook wat je net met de hand
  hebt aangepast. Dat is letterlijk wat je vroeg, en het is iets wat je moet
  *zien* gebeuren — de e2e-zaak doet precies dat: 2 voor iedereen, 5 bij één, dan
  3 boven, en die 5 wordt 3.
- **Het vinkje is het *wie*, het bedrag het *hoeveel*.** Het globale getal raakt
  alleen bedragen: iedereen op 3 zetten mag niemand stilletjes weer uitnodigen
  die er net af was gehaald.
- **Een 0, een leeg vak en een uitgezet vinkje betekenen hetzelfde.** Als één van
  die drie wél een regel schreef, was die ene een val.
- **`handOut` schrijft gewone grants.** Geen nieuwe soort regel, geen tweede
  tabel: een uitdeling *is* een handvol grants, en het grootboek hoort ze zo te
  tonen. Het saldo blijft de som van het grootboek zonder dat iets daarvan iets
  nieuws hoeft te leren.
- **Alles of niets**, in één transactie. Komt één kamer onder nul, dan gaat er
  niets door en noemt de fout die onderzoeker. Een half uitgedeelde beloning is
  erger dan een weigering: aan het scherm zie je niet wie wel en wie niet kreeg,
  dus de enige veilige reparatie zou zijn om acht grootboeken met de hand na te
  lopen. Dat is ook de reden dat het geen lus over `grant` is — die opent zijn
  eigen transactie, en een lus daarover is precies de halve uitdeling.
- Een **negatief** bedrag mag, net als bij een losse grant (een boete aan tafel).
  De bodem op nul geldt per kamer.

Keeper-only op **drie** plekken (§80: een slot heeft ook aan de buitenkant van de
deur een gleuf nodig): `handOut` weigert iedereen anders, de pagina is een 404
voor wie geen Keeper is, en `canWatch` geeft de plek `/uitdelen` alleen aan hem —
anders leest een speler in het aanwezigheidslijstje dát je staat uit te delen,
wat op zichzelf al iets verklapt.

Twee deuren ernaartoe: in de kop van het grootboek (waar je toch al munten geeft)
en op `/spelers` (de pagina die "iedereen" heet).

### 3. Dubbel mag

§80 weigerde een tweede leesstoel in dezelfde kamer, met de redenering *"twee
identieke lampen op één raster is ook niemands bedoeling"*. Die redenering was van
ons, niet van jou.

Wat blijft is `one_of_a_kind`: één voorwerp is één ding in de wereld, die vraag
wordt aan het hele archief gesteld, en de unieke index op `room_slots.claim`
staat gewoon nog. Voor al het andere wordt er **niets** gevraagd
(`requireNotPlaced`, de ene plek waar `placeItem` en `buyFurnishing` het samen
vragen).

En de lezers moesten mee, want dit is §17's regel 4 en dat is dit project al zijn
terugkerende fout:

- `catalogueFor` houdt alleen nog **claims** weg, en heeft de kamer niet meer
  nodig — die stond er alleen in om weg te laten wat je al had.
- In de winkel is `owned` een **label** geworden en geen weigering. Alleen
  `unique && (owned || takenElsewhere)` houdt een rij nog tegen.

### 4. Een ding op meerdere soorten plek

Het veld `plek` werd van `select` een **`multiselect`** (dat veldsoort bestond al
sinds §38 en slaat een array op).

**Migratie `0029` doet twee dingen die onlosmakelijk bij elkaar horen:** de
velddefinitie voor élke soort die zo'n veld heeft, én elke opgeslagen waarde van
`"muur"` naar `["muur"]`. Een `multiselect` weigert bij het opslaan alles wat geen
lijst is, dus zonder die tweede helft had de eerstvolgende bewerking van elk
voorwerp stil zijn plek gewist. De definitie wordt met `json_each` gevonden en niet
met een tekstvervanging — anders vindt hij niets meer zodra jij het label *Plek*
hernoemd hebt, en een migratie die stil niets doet is de ergste soort die er is.

`plekKinds` in `lib/kamers/shape.ts` is de ene lezer, en die **blijft een losse
string aannemen**. Niet uit slordigheid: een archief dat de migratie om wat voor
reden dan ook niet gezien heeft hoort niet stilletjes al zijn kamers te
verliezen. Het kost één regel, en de soort die de e2e-test met de hand in Beheer
maakt (met gewone tekstvakjes) bewijst het meteen.

In de winkel is `landsIn` daardoor **per soort plek**. Een klok die aan de muur
én op het bureau kan, met een volle muur en een vrij bureau, is onder *muur* niet
te koop en onder *bureau* wel — één antwoord voor allebei zou de winkel in een
van zijn twee groepen laten liegen. Zo'n ding staat dan ook in **beide** groepen.

## De fouten die onderweg gevonden zijn

Drie, en alle drie dezelfde: **een lezer die achterbleef toen de schrijver
verschoof** (§17's regel 4).

1. **De plek-kiezer vroeg het veld als enige in SQL.** Elke lezer van `plek` gaat
   door `plekKinds` — behalve `app/api/kamers/[id]/voorwerpen/route.ts`, die het
   van duizend rijen moet weten en dus `json_extract(fields,'$.plek') = 'bureau'`
   vroeg. Dat vindt `["bureau"]` nooit. De kiezer bood **niets** meer aan terwijl
   `placeItem` alles nog accepteerde. Geen enkele unittest zag het; de browser zag
   het in één run. Die voorwaarde heet nu `plekMatches`, staat naast de andere
   lezers in `lib/kamers/service.ts`, kent allebei de vormen, en wordt tegen
   `plekKinds` getest — rij voor rij, voor elke soort plek.
2. **`ledgerOf` sorteerde op `id` terwijl zijn eigen comment `rowid` zei.** En
   `lib/ids.ts` maakt een id uit zestien willekeurige bytes, dus twee regels in
   dezelfde seconde kwamen in geen enkele volgorde terug — een grant en de uitgave
   die hij betaalde, bijvoorbeeld. Dat stond er sinds §79 en was onzichtbaar
   zolang alleen jij keek; een uitdeling landt per ontwerp in één seconde. Nu
   `rowid`, met een test die zes regels achter elkaar schrijft.
3. **De e2e helpers wezen naar `#field-plek`.** Een `multiselect` tekent §38's rij
   vinkjes met een `role="group"` in plaats van één besturingselement met een id,
   dus dat adres bestaat niet meer en drie specs liepen er stil op vast. Er staat
   nu één `setPlekken`/`expectPlekken` in `tests/e2e/helpers.ts`.

En drie asserties zijn **bewust omgekeerd**, elk met een zin erbij die zegt dat
het een omkering is en waarom:

- `kamer.spec.ts`: een ander ziet het grootboek nu wél (het was: helemaal niet
  getekend, en de reden van een regel stond nergens in de payload).
- `huisraad.test.ts` + `winkel.spec.ts`: hetzelfde stuk huisraad twee keer mag nu.
- `winkel.test.ts`: `landsIn` wijst nog ergens heen voor iets dat je al hebt.

## Regels die niet gebroken mogen worden

1. **Rule 78 blijft.** Effectregels worden getoond, nooit opgeteld, nooit
   toegepast. Twee dezelfde klokken zijn twee regels onder het raster.
2. **Het saldo blijft de som van het grootboek.** Een uitdeling schrijft regels;
   hij zet geen kolom.
3. **§76: een versluierd ding noemt zijn naam niet** — nu ook niet in het
   grootboek, en met dezelfde zin als overal.
4. **§17 regel 4: lezers en schrijvers zeggen dezelfde zin.** Deze ronde
   verschoof die zin twee keer en vond twee achterblijvers; als er een derde
   grens verschuift, loop de lezers na — `catalogueFor`, `shopFor`,
   `plekMatches`, de winkelknop.
5. **§80: een slot heeft ook aan de buitenkant van de deur een gleuf nodig.**
6. **Uniek blijft uniek.** De index op `claim` staat er nog.
7. **Alles of niets** bij een uitdeling.

## Wat er bewust niet in zit

- Een uitdeling met één knop terugdraaien. Een correctie is een regel erbij
  (§79), en dat blijft zo.
- Sjablonen of opgeslagen groepen in de uitdeler.
- Een geschiedenis van uitdelingen apart van het grootboek.
- Huisraad dat ander huisraad uitsluit of vereist, terugverkopen, een tweede munt.
- `/uitdelen` in de navigatie. De telefoontabbalk zit vol (§66); de twee deuren
  staan waar je toch al bent.

## Wat er getest is

- **Unit**: `tests/unit/uitdelen.test.ts` (57 gevallen) — het open grootboek en
  zijn sluier van beide kanten, `handOutTargets`, `handOut` met elke weigering
  plus het grootboek dat daarbij *niet* geschreven werd, `plekKinds`,
  `plekMatches` tegen `plekKinds` rij voor rij, dubbel mogen tegenover uniek
  blijven, en **de migratie zelf** tegen een archief in de vorm die `0028`
  achterlaat (inclusief tweemaal draaien, en een hernoemd label).
  Plus de bijgewerkte `kamer`, `huisraad` en `winkel`.
- **e2e**: `tests/e2e/uitdelen.spec.ts` (4 zaken) en een nieuwe zaak in
  `winkel.spec.ts` voor een ding met twee plekken dat in twee groepen staat en
  per groep een ander antwoord geeft.
- `tsc --noEmit` stil, `npm run build` schoon, de volledige Playwright-suite
  gedraaid.

## De uitrol

Deze ronde heeft een migratie: **`0029_meerdere_plekken`**. Die draait vanzelf bij
het starten. Op de VPS staan `0027_kamers` en `0028_huisraad` nog te wachten, dus
bij de eerste start na deze ronde draaien alle drie.

Er is **niets verwijderd** in deze ronde, dus er is geen `git rm` nodig.
