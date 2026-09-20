# Het kamer-contract — de kamer, de winkel, de uitdeler en de hal

Opgesteld in ronde 46 (§85), op de code die ronde 45 (§84) achterliet. Het
model is `docs/canvas-contract.md`: dáár staan vier tekenvlakken naast elkaar
en is elk verschil een regel met een reden. Hier staan **zeven schermen** naast
elkaar — de schil, `/kamer/<slug>`, de plek-kiezer, `/winkel`, `/uitdelen`,
`/spelers`, `/spelers/<naam>` en `/e/<slug>` van een gedragen onderzoeker — en
geldt hetzelfde: een verschil dat blijft staan, staat hier met zijn reden.

## Hoe je dit leest

- Elke regel is **genummerd** (`K1`, `K2`, …) en bindend, zoals de regels in
  `README.md` dat zijn. Code die een regel draagt noemt hem in een comment.
- **Wat hier staat is afspraak, geen opmaak.** Geen kleuren, geen marges, geen
  pixelmaten behalve waar het getal zelf de afspraak is (44 px, 767 px).
- Een regel met **`gemeten`** is nagerekend in de gebouwde app op 1440×900 en
  390×844 tegen een verse `data-e2e`; de meting staat in
  `claude/round-46-de-kamer-in-de-hand.md`.
- Een regel met **`bewaakt`** heeft een test die hem vasthoudt, met het bestand
  erbij. Een UX-regel die niet gemeten wordt, slijt (§84) — dus is "bewaakt"
  het normale geval en is een regel zonder wacht een regel die hier met een
  reden staat.

---

## 1. Geld

| | Regel | |
|---|---|---|
| **K1** | **Een saldo en een prijs zien er niet hetzelfde uit.** Een prijs is een `.stamp`: rood, gedraaid, omlijnd, een kaartje aan een ding. Een saldo is `components/kamer/Beurs.tsx`: rechtop, gewone inkt, een munticoon ervoor. Nooit andersom, en nooit allebei dezelfde vorm. | bewaakt (`kamer-contract.test.ts`, contrast per palet) |
| **K2** | **Het archief rekent geen saldo uit.** Elk scherm leest `balanceOf` / `RoomView.balance` en toont dat getal; ook een animatie loopt naar het getal dat de server teruggaf, niet naar een som die de browser maakte. (§79 regel 1, rule 78.) | |
| **K3** | **Elke knop die geld kost, draagt zijn bedrag** — *Openen · 3 munten*, *Kopen · 5 munten* — en wel vóór de klik. | bewaakt (`kamer-ux.spec.ts`, zaak 2) |
| **K4** | **Elke uitgave krijgt een melding ná afloop** die zegt wát er gebeurd is en wáár het heen is, met een deur ernaartoe waar die bestaat. Geen bevestigingsdialoog: dit doe je twintig keer op een avond. | bewaakt (`kamer-ux.spec.ts`, zaak 2) |
| **K5** | **"Nog n nodig" is zichtbare tekst**, nooit een `title` — een `title` bestaat niet op een telefoon. En er staat óf een knop óf die zin, nooit allebei en nooit geen van beide. | bewaakt (`kamer-ux.spec.ts`, zaak 4) |
| **K6** | **Een bedrag in het grootboek is geen prijskaartje.** Erbij in gewone inkt en vet, eraf gedempt, niets rood. (§85; tot ronde 46 waren het drie rode stempels onder elkaar, waarvan één met een `+`.) | bewaakt (`kamer-contract.test.ts`) |

## 2. Woorden

| | Regel | |
|---|---|---|
| **K7** | **Elk zichtbaar woord is een sleutel in `lib/words.ts`** (§11). Een zin met een getal of een naam erin is een sleutel *met een gat* — `'Nog {n} nodig'` — en `fill()` vult hem. De Keeper mag de zin herschrijven en zelfs het gat weghalen; dan staat het getal er niet meer, en dat is zijn keuze. | bewaakt (`kamer-contract.test.ts`, grep over de scope) |
| **K8** | **Een regel in het grootboek is een zin over iets dat gebeurd is**, geen veldnaam met een dubbele punt: *Plank geopend*, *Prent demo gekocht*, *Van de Keeper: Startgeld*. | bewaakt (`kamer-ux.spec.ts`, zaak 8) |
| **K9** | **Een versluierd ding zegt overal dezelfde ene zin** (§76): een versluierde plek, een versluierde grootboekregel en een versluierde effectregel zijn niet van elkaar te onderscheiden. Het verschil zou zelf het lek zijn. | |
| **K10** | **Eén werkwoord per handeling.** *Geven* is wat de Keeper aan één kamer doet, *Uitdelen* aan de hele tafel, *Kopen* wat een speler in de winkel doet, *Neerzetten* wat hij in zijn kamer doet. *Uitgeven* bestaat niet. | |
| **K11** | **Een deur draagt een werkwoord**, geen bestemming: *Naar de kamer*, niet *Kamer*. Een deur die naar zijn bestemming genoemd is, leest als een kop. | bewaakt (`kamer-contract.test.ts`) |

## 3. Vormen

| | Regel | |
|---|---|---|
| **K12** | **Eén icoon per betekenis, en geen enkele vorm betekent twee dingen.** De tabel staat in `components/kamer/plekWords.ts` (`MEANING`, `CLAIMED_ICONS`) en is de enige bron. | bewaakt (`kamer-contract.test.ts`, en de omgekeerde vraag) |
| **K13** | **Geen letterlijke kleur in `app/kamer.css` en `app/spelers.css`.** Alles is een token uit `lib/theme/schemes.ts` of een `color-mix` daarvan. | bewaakt (`kamer-contract.test.ts`) |
| **K14** | **Elke `className` die deze schermen schrijven, wordt door een geïmporteerd stylesheet getekend.** Een klasse die niets tekent is een klasse die iemand gaat vertrouwen. | bewaakt (`kamer-contract.test.ts`) |
| **K15** | **Het breekpunt is 767 px**, hetzelfde getal als `useIsPhone` en de rest van de app. | bewaakt (`kamer-contract.test.ts`) |
| **K16** | **Een vinger meet 44 px, en dat getal staat in `--tap`** — nooit als `44px` in een stylesheet van deze feature. Geldt voor alles op deze schermen wat een duim raakt: knoppen, chips, tabs, het kruisje op een tegel. | bewaakt (`kamer-ux.spec.ts`, die élke zichtbare knop opmeet in plaats van een lijstje af te lopen) |

## 4. Het raster

| | Regel | |
|---|---|---|
| **K17** | **Eén rijhoogte, vast, voor alle vier de staten.** `grid-auto-rows` zet hem; een tegel heeft geen `min-height` van zichzelf. Het raster mag niet veranderen doordat er iets in komt te liggen. | gemeten · bewaakt (`kamer-ux.spec.ts`, zaak 7; `kamer-contract.test.ts`) |
| **K18** | **Een gevulde tegel toont een vierkante uitsnede** (`shape="square"`), nooit hoger dan breed. Die maat hoort bij de *tegel* (`.plek .plek-cover`) en niet bij de klasse, want een winkelrij draagt dezelfde klasse op een andere breedte. | bewaakt (`kamer-contract.test.ts`) |
| **K19** | **Een lege en een gesloten tegel dragen een groot gedempt merk** — de soort plek, respectievelijk het slot — op de plek waar bij een gevulde tegel de omslag staat. Een raster van lege vakjes met één woord erin leest als een pagina die nog laadt. | |
| **K20** | **De ladder is de volgorde.** `sort_order` bepaalt waar een tegel staat; niets herordent open tegels vóór gesloten, en `landsIn` landt op de eerste vrije plek in de volgorde van de ladder — niet in die van `PLEK_KINDS`. (§84's vierde fout.) | bewaakt (`winkel.test.ts`) |
| **K21** | **Weghalen is geen gelijke van Neerzetten.** Het is een klein kruisje rechtsboven in de gevulde tegel, met een volwaardig raakvlak en met de naam van wat het weghaalt in zijn `aria-label` — je zet tien dingen neer voor je er één weghaalt. | |
| **K22** | **Wat deze kamer je geeft staat bóven het raster**, en wordt ook getekend als er nog niets ligt: één zin plus de deur naar de winkel. Een lege kamer zonder die zin leest als een pagina die stuk is. | |
| **K23** | **Het grootboek staat onderaan en ingeklapt** op de laatste drie regels, met één knop die de rest toont. Dat is een gemak en geen recht — de sluier van §76 zit in `ledgerOf` en niet in de knop. | bewaakt (`kamer-ux.spec.ts`, zaak 8) |

## 5. De winkel

| | Regel | |
|---|---|---|
| **K24** | **Eén lijst, één rij per ding**, goedkoopste eerst, met een filterrij (Alles · Muur · Plank · Bureau · Kist) die filtert in plaats van dupliceert. Een ding dat op twee soorten plek past toont twee plek-chips en één koopknop. (§85 hield dit; §84 keerde er rule 82 voor om.) | bewaakt (`winkel.spec.ts`) |
| **K25** | **De ontdubbeling zit in de pagina, niet in `shopFor`.** `landsIn` blijft per soort plek, want de server moet per soort kunnen blijven antwoorden. | bewaakt (`winkel.test.ts` blijft ongewijzigd groen) |
| **K26** | **Wat je niet kunt betalen staat er toch**, gedempt, met de prijs erop en de tekortzin eronder. Een winkel die alleen toont wat je kunt afrekenen is een kassa: je kunt niet sparen voor wat je niet ziet. | bewaakt (`winkel.spec.ts`) |
| **K27** | **Elke knop wordt op de server nóg een keer geweigerd.** Een UI-staat is nooit de enige bewaker (§17 regel 4): `buyFurnishing` stelt al zijn vragen opnieuw, hoe de knop ook ingedrukt werd. | |

## 6. De plek-kiezer

| | Regel | |
|---|---|---|
| **K28** | **Twee echte tabs**, precies één geselecteerd, `role="tablist"` met `aria-selected` — geen `chip-selectable` met `aria-pressed`, want dat is het patroon van een *filter* en daar mag er geen of drie van aan staan. | bewaakt (`kamer-ux.spec.ts`, zaak 9) |
| **K29** | **Het blad opent op het tabblad dat iets te zeggen heeft.** Bezit de speler niets dat hier past, dan begint hij in de catalogus. Het gebeurt nadat het antwoord binnen is, en precies één keer per opening — een tabblad dat onder je hand terugspringt is erger dan een leeg tabblad. | bewaakt (`kamer-ux.spec.ts`, zaak 9) |
| **K30** | **Eén zoekvak, boven allebei de tabs**, en het filtert allebei de lijsten: het bezit op de server, de catalogus in de browser. | bewaakt (`kamer-ux.spec.ts`, zaak 9) |

## 7. De uitdeler

| | Regel | |
|---|---|---|
| **K31** | **Het globale getal overschrijft elk bedrag eronder**, ook wat met de hand is aangepast. Dat is wat Nick vroeg, en het moet zichtbaar gebeuren: alle vakjes bewegen tegelijk. | bewaakt (`uitdelen.test.ts`) |
| **K32** | **Het vinkje en het bedrag zijn twee vragen.** Het vinkje is *wie*, het bedrag is *hoeveel*; het globale getal raakt alleen het tweede. Een vinkje weghalen en een 0 typen betekenen allebei *deze niet*, en ze spreken elkaar niet tegen. | bewaakt (`uitdelen.test.ts`) |
| **K33** | **Eén knop, één reden, één transactie.** Een halve uitdeling is vanaf dit scherm niet te zien en mag daarom niet bestaan. | bewaakt (`uitdelen.test.ts`) |
| **K34** | **De voet plakt en zegt in een zin wat de knop gaat doen** — *36 munten naar 12 kamers* — en de knop staat op een telefoon in beeld zonder scrollen. De som is een echo van de vakjes en nooit een bevinding over het archief (rule 78). | gemeten · bewaakt (`kamer-ux.spec.ts`, zaak 10) |
| **K35** | **De FAB wijkt** waar de pagina zijn eigen laatste knop heeft (`/uitdelen`) en boven een open blad. Twee dingen rechtsonder is er één te veel. | bewaakt (`kamer-ux.spec.ts`, zaak 10) |

## 8. De hal en de spelerspagina

| | Regel | |
|---|---|---|
| **K36** | **Jij staat bovenaan in de hal, en er staat bij waarom** — de server sorteert dat, niet de browser, zodat de lijst niet een tel later verspringt. De rest houdt de volgorde die hij had. | bewaakt (`kamer-ux.spec.ts`, zaak 11) |
| **K37** | **Online is een woord**, geen kleur alleen. Het komt uit de roster die de schil al heeft (§76) en nergens anders vandaan — dus geen tweede lijst en geen tweede stel regels over wie genoemd mag worden. | |
| **K38** | **Een paneel is een samenvatting met een deur, en niets erin is bedienbaar** (§77). Er staat ook niets in een paneel dat geen eigen pagina heeft: daarom heeft *Recente bijdragen* sinds §85 geen deur meer — de Start is de feed van iedereen en beloofde "meer hiervan" terwijl hij iets anders gaf. | |
| **K39** | **De volgorde is Kamer, Karakters, Aanwezig, Dossiers, Bijdragen**, en het kamerpaneel vult de hele eerste rij. De oude volgorde was die waarin de panelen gebouwd zijn en zette het paneel dat meestal leeg is vooraan. | bewaakt (`spelers-page.test.ts`) |
| **K40** | **Een gedragen onderzoeker wijst naar zijn kamer** — één regel onder de kop van `/e/<slug>`: de beurs en de deur. Absent voor wie er niet in mag, en de pagina erachter blijft de 404 die hij is (§80). | bewaakt (`kamer-ux.spec.ts`, zaak 12) |

---

## Wat hier bewust níét in staat

- **Hoe iets eruitziet.** Kleuren, marges en lettergroottes horen in de
  stylesheet en in de screenshots van de rondedoc, niet in een contract. Een
  document dat opmaak vastlegt maakt elke volgende ronde duurder zonder iets
  te bewaken.
- **Terugverkopen, ruilen, een tweede munt, sjablonen in de uitdeler.** Die
  bestaan niet; een contract over iets dat niet bestaat is een ontwerp.
- **Rule 78 zelf.** Dat het archief nooit een bonus uitrekent staat in
  `README.md` en geldt voor de hele app, niet alleen voor deze zeven schermen.

## Wat open staat

- **De catalogusrij en de winkelrij zijn nog twee componenten.** Ze zeggen
  dezelfde staten met dezelfde woorden en dezelfde klassen, maar het zijn
  `Catalogus` in `PlaceButton.tsx` en `WinkelRij.tsx`. Het samenvoegen vroeg
  om een verzonnen `ShopItem` met een `landsIn` en een `unique` die de kiezer
  al wéét — een leugen in een type is duurder dan een tweede component. Zie de
  rondedoc van §85.
- **`.btn-small` is 34 px buiten deze schermen.** §85 tilde de tap-vloer naar
  44 px op de pagina's van deze feature en liet de rest van het archief staan,
  precies zoals §69 6.1 dat deed voor de tekenvlakken. Of dat app-breed moet
  worden is Nicks keuze, geen gevolg.
- **De hal heeft geen kolom voor het saldo.** Hij zou er passen en hij zou
  §76 breken: het beursblok toont alleen je eigen saldo, nooit dat van een
  ander.
