# Het kamer-contract — de kamer, de winkel, de uitdeler en de hal

Opgesteld in ronde 46 (§85), op de code die ronde 45 (§84) achterliet. Het
model is `docs/canvas-contract.md`: dáár staan vier tekenvlakken naast elkaar
en is elk verschil een regel met een reden. Hier staan **zeven schermen** naast
elkaar — de schil, `/kamer/<slug>`, de plek-kiezer, `/winkel`, `/uitdelen`,
`/spelers`, `/spelers/<naam>` en `/e/<slug>` van een gedragen onderzoeker — en
geldt hetzelfde: een verschil dat blijft staan, staat hier met zijn reden.

Bijgewerkt in ronde 51 (§90, *De deuren*). K3, K10, K11, K21, K22, K35 en K45
kregen een zin bij, en K48 is nieuw. Wat daar veranderde, staat in de regel
zelf, met *sinds §90* erbij.

Bijgewerkt in ronde 52 (§91, *Jouw plek*). **De schil** is sindsdien iets
anders dan in ronde 46. De beurs-pil in de hoek is weg, op elke breedte. De
deur naar je kamer is nu *Kamer* in de groep *Jouw plek* van de zijbalk
(`yours-kamer`), met het saldo ernaast. Op een telefoon is het de Jij-tab
(`tab-jij`), die het saldo draagt en een blad opent met *Naar de kamer*. Op
Start staat dezelfde deur in de Jij-rij. K1, K11 en K40 kregen een zin bij.

Bijgewerkt in ronde 54 (§93, *De kamer, tweede pas*). Een kamer bezit nu wat
op zijn plekken ligt **plus wat in zijn lade ligt** (`room_drawer`, migratie
`0033_de_lade`). Weghalen legt huisraad in de lade, `placeItem` weigert een
speler huisraad dat daar niet ligt, een koop mag binnen tien seconden terug,
en een ding kan verplaatst worden. K21, K22, K42 en K48 veranderden, K49, K50
en K51 zijn nieuw (sectie 10), en E1 is uit *Wat open staat*. K1's
uitzondering is sinds 21 september door Nick vastgelegd.

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
| **K1** | **Een saldo en een prijs zien er niet hetzelfde uit.** Een prijs is een `.stamp`: rood, gedraaid, omlijnd, een kaartje aan een ding. Een saldo is `components/kamer/Beurs.tsx`: rechtop, gewone inkt, een munticoon ervoor. Nooit andersom, en nooit allebei dezelfde vorm. **Eén benoemde uitzondering, sinds §91:** het saldo naast *Kamer* in de zijbalk is een `.nav-tail` (`yours-saldo`) en niet het component, want een menuregel heeft geen ruimte voor zijn rand en opvulling. Het heeft wel dezelfde vorm (munt ervoor, rechtop, inkt, nooit `.stamp`). Het Jij-blad, de Jij-rij op Start en de kamer tekenen wél `Beurs.tsx`, en de Jij-tab heeft een eigen kleine vorm onder het poppetje (`tab-jij-saldo`), ook met de munt ervoor. **Vastgelegd door Nick op 21 september (na ronde 52):** de staart in de zijbalk (`.nav-tail`) en die op de Jij-tab (`tab-jij-saldo`) zijn samen de benoemde uitzondering. Het is geen restpunt meer. Het risico blijft wel: lopen de twee vormen ooit uiteen, dan loopt de staart als eerste weg. Sinds §93 tekent ook de eerste rij van je eigen spelerspagina `Beurs.tsx` (K42). | bewaakt (`kamer-contract.test.ts`, contrast per palet) |
| **K2** | **Het archief rekent geen saldo uit.** Elk scherm leest `balanceOf` / `RoomView.balance` en toont dat getal; ook een animatie loopt naar het getal dat de server teruggaf, niet naar een som die de browser maakte. (§79 regel 1, rule 78.) | |
| **K3** | **Elke knop die geld kost, draagt zijn bedrag** — *Openen · 3 munten*, *Kopen · 5 munten* — en wel vóór de klik. Sinds §90 zegt een koopknop in de winkel ook waar het ding landt (*Kopen · 5 munten → muur*, `buyLandsOn`). Wie meer dan één onderzoeker draagt, ziet erop voor wie hij koopt (*Kopen voor Bertus · …*, `shopForName`). Het filter dat aanstaat bepaalt die plek als hij vrij is; anders geldt K20. | bewaakt (`kamer-ux.spec.ts`, zaak 2) |
| **K4** | **Elke uitgave krijgt een melding ná afloop** die zegt wát er gebeurd is en wáár het heen is, met een deur ernaartoe waar die bestaat. Geen bevestigingsdialoog: dit doe je twintig keer op een avond. | bewaakt (`kamer-ux.spec.ts`, zaak 2) |
| **K5** | **"Nog n nodig" is zichtbare tekst**, nooit een `title` — een `title` bestaat niet op een telefoon. En er staat óf een knop óf die zin, nooit allebei en nooit geen van beide. | bewaakt (`kamer-ux.spec.ts`, zaak 4) |
| **K6** | **Een bedrag in het grootboek is geen prijskaartje.** Erbij in gewone inkt en vet, eraf gedempt, niets rood. (§85; tot ronde 46 waren het drie rode stempels onder elkaar, waarvan één met een `+`.) | bewaakt (`kamer-contract.test.ts`) |

## 2. Woorden

| | Regel | |
|---|---|---|
| **K7** | **Elk zichtbaar woord is een sleutel in `lib/words.ts`** (§11). Een zin met een getal of een naam erin is een sleutel *met een gat* — `'Nog {n} nodig'` — en `fill()` vult hem. De Keeper mag de zin herschrijven en zelfs het gat weghalen; dan staat het getal er niet meer, en dat is zijn keuze. | bewaakt (`kamer-contract.test.ts`, grep over de scope) |
| **K8** | **Een regel in het grootboek is een zin over iets dat gebeurd is**, geen veldnaam met een dubbele punt: *Plank geopend*, *Prent demo gekocht*, *Van de Keeper: Startgeld*. | bewaakt (`kamer-ux.spec.ts`, zaak 8) |
| **K9** | **Een versluierd ding zegt overal dezelfde ene zin** (§76): een versluierde plek, een versluierde grootboekregel en een versluierde effectregel zijn niet van elkaar te onderscheiden. Het verschil zou zelf het lek zijn. | |
| **K10** | **Eén werkwoord per handeling.** *Geven* is wat de Keeper aan één kamer doet, *Uitdelen* aan de hele tafel, *Kopen* wat een speler in de winkel doet, *Neerzetten* wat hij in zijn kamer doet. *Uitgeven* bestaat niet. **Geven gaat alleen over munten**: een kamer voor een onderzoeker heet *Kamer maken* (§90; de knop heette *Een kamer geven*). | |
| **K11** | **Een deur draagt een werkwoord**, geen bestemming: *Naar de kamer*, niet *Kamer*. Een deur die naar zijn bestemming genoemd is, leest als een kop. Sinds §90 zijn het er zes, allemaal met *Naar*: *Naar de kamer*, *Naar de winkel*, *Naar de uitdeler* en *Naar de spelers*, plus de oudere *Naar de karakters* en *Naar de dossiers*. Een deur naar de winkel die een kamer kent, geeft die mee (`?kamer=`). **Sinds §91 geldt dit voor een deur óp een pagina of in een blad, niet voor een regel in een menu.** In de zijbalk heten *Kamer* en *Winkel* naar hun bestemming, net als *Dossiers* en *Wiki* erboven: een menu is een lijst bestemmingen. Het Jij-blad en de Jij-rij op Start tekenen dezelfde deuren als knoppen, en daar staat wél *Naar de kamer* en *Naar de winkel*. De winkeldeur geeft in alle drie `?kamer=` mee, van de kamer van het karakter dat je speelt. | bewaakt (`kamer-contract.test.ts`) |

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
| **K21** | **Weghalen is geen gelijke van Neerzetten.** Het is een klein kruisje rechtsboven in de gevulde tegel, met een volwaardig raakvlak en met de naam van wat het weghaalt in zijn `aria-label` — je zet tien dingen neer voor je er één weghaalt. Sinds §90 staat het kruisje ook op een scherm met een muis altijd in beeld, gedempt, met een raakvlak van `--tap`. Tot dan verscheen het pas bij hover (review E9). **Sinds §93 staat er *Verplaatsen* onder het kruisje**, net zo klein getekend, gedempt en altijd in beeld, met een raakvlak van `--tap` (`Verplaatsen.tsx`). Onder en niet ernaast, want ernaast dekte het het etiket van de plek af. Verplaatsen is tik-tik en geen sleep (WCAG 2.5.7): een statusbalk met *Annuleren*, *Hierheen* op elke vrije plek waar het ding past, en Escape of een tik ernaast breekt af. Weghalen legt huisraad in de lade (K49) en de melding zegt dat. | bewaakt (`ronde-54-de-kamer.spec.ts`) |
| **K22** | **Wat deze kamer je geeft staat bóven het raster**, en wordt ook getekend als er nog niets ligt. Een lege kamer zonder die zin leest als een pagina die stuk is. Sinds §90 is de lege variant **alleen de zin**, zonder winkelknop: de deur naast de beurs is de enige (review E12). In de kamer van een ander noemt die zin de naam (*Nog niets dat Kees iets geeft*), en sinds §93 ook de kop (*Wat deze kamer Kees geeft*, `roomEffectsOf`). Op een telefoon is het gevulde blok een `<details>` die dicht begint, met een telling *· n* achter de kop die alleen daar zichtbaar is (`EffectenFold`). Elke gevulde tegel draagt bovendien zijn eerste effectregel klein onder de naam. | bewaakt (`huisraad.spec.ts`: op een breed scherm is het blok precies de kop, de namen en de regels, zonder telling, rule 78; `ronde-51-economie.spec.ts` zaak 3 voor de lege zin met de naam) |
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
| **K31** | **Het globale getal overschrijft elk **aangevinkt** bedrag eronder**, ook wat met de hand is aangepast — en niets anders. Een rij die je later aanvinkt krijgt het er alsnog bij, zodat de volgorde van je handelingen niet uitmaakt. (§86 zette *aangevinkt* erin: met een lijst die leeg begint zou "alles" vijfenvijftig bedragen klaarzetten die niemand krijgt.) | bewaakt (`uitdelen.test.ts`, `kamer-ux.spec.ts` zaak 13) |
| **K32** | **Het vinkje en het bedrag zijn twee vragen.** Het vinkje is *wie*, het bedrag is *hoeveel*; het globale getal raakt alleen het tweede. Een vinkje weghalen en een 0 typen betekenen allebei *deze niet*, en ze spreken elkaar niet tegen. | bewaakt (`uitdelen.test.ts`) |
| **K33** | **Eén knop, één reden, één transactie.** Een halve uitdeling is vanaf dit scherm niet te zien en mag daarom niet bestaan. | bewaakt (`uitdelen.test.ts`) |
| **K34** | **De voet plakt en zegt in een zin wat de knop gaat doen** — *36 munten naar 12 kamers* — en de knop staat op een telefoon in beeld zonder scrollen. De som is een echo van de vakjes en nooit een bevinding over het archief (rule 78). | gemeten · bewaakt (`kamer-ux.spec.ts`, zaak 10) |
| **K35** | **De FAB wijkt** waar de pagina zijn eigen laatste knop heeft (`/uitdelen`) en boven een open blad. Twee dingen rechtsonder is er één te veel. (§90 breidde dit uit buiten deze feature: de FAB wijkt ook op elk tekenvlak en voor elk gedokt paneel, zie `canvas-contract.md` rij 14.) | bewaakt (`kamer-ux.spec.ts`, zaak 10) |
| **K36** | **De lijst begint leeg.** Niets staat aangevinkt bij het openen, er is een zoekvak dat op de naam van de onderzoeker **én** die van de speler filtert, en *Alles in beeld* vinkt precies aan wat het filter op dat moment toont. De telling gaat over de héle lijst en niet over wat je ziet — want het getal dat je wilt weten is wat er búiten beeld aanstaat. | bewaakt (`kamer-ux.spec.ts`, zaak 13) |
| **K37** | **Elke rij zegt wát voor onderzoeker het is**: wie hem draagt, of die hem nu speelt, en of er helemaal niemand achter zit. De lijst had de niet-gespeelde karakters altijd al; tot §86 zei niets dat, en een waarheid die nergens staat is er voor de lezer niet. | bewaakt (`uitdelen.test.ts`, `kamer-ux.spec.ts` zaak 14) |
| **K38** | **Een lege bedragrij is leeg**, geen `0` als placeholder. Een nul in een getallenvak leest als een waarde die er al staat — dezelfde regel als voor het globale vak (§85). | |

## 8. De hal en de spelerspagina

| | Regel | |
|---|---|---|
| **K39** | **Jij staat bovenaan in de hal, en er staat bij waarom** — de server sorteert dat, niet de browser, zodat de lijst niet een tel later verspringt. De rest houdt de volgorde die hij had. | bewaakt (`kamer-ux.spec.ts`, zaak 11) |
| **K40** | **Online is een woord**, geen kleur alleen. Het komt uit de roster die de schil al heeft (§76) en nergens anders vandaan — dus geen tweede lijst en geen tweede stel regels over wie genoemd mag worden. Sinds §91 leest *n online* achter *Spelers* in de zijbalk en het Jij-blad diezelfde roster. | |
| **K41** | **Een paneel is een samenvatting met een deur, en niets erin is bedienbaar** (§77). Er staat ook niets in een paneel dat geen eigen pagina heeft: daarom heeft *Recente bijdragen* sinds §85 geen deur meer — de Start is de feed van iedereen en beloofde "meer hiervan" terwijl hij iets anders gaf. | |
| **K42** | ~~**De volgorde is Kamer, Karakters, Aanwezig, Dossiers, Bijdragen**, en het kamerpaneel vult de hele eerste rij. De oude volgorde was die waarin de panelen gebouwd zijn en zette het paneel dat meestal leeg is vooraan.~~ **Sinds §93 hangt de volgorde af van wie kijkt, en `panelsFor(isSelf)` is de enige die hem kent.** Op je eigen pagina staat eerst een rij met wie je speelt, je saldo (`Beurs.tsx`) en *Naar de kamer* en *Naar de winkel*; dan Kamer, Karakters, Dossiers en Bijdragen. Aanwezig valt weg: dat je er bent weet je. Op die van een ander staat eerst *online* en *Speelt nu* (de naam alleen als je dat artikel mag zien, §76), dan Karakters, Kamer, Dossiers, Bijdragen, en Aanwezig onderaan. Je komt op je eigen pagina met een andere vraag dan op die van een ander (review, onderzoek §5). | bewaakt (`spelers-page.test.ts`) |
| **K43** | **Een gedragen onderzoeker wijst naar zijn kamer** — één regel onder de kop van `/e/<slug>`: de beurs en de deur. Absent voor wie er niet in mag, en de pagina erachter blijft de 404 die hij is (§80). | bewaakt (`kamer-ux.spec.ts`, zaak 12) |

## 9. De kamer zonder drager

| | Regel | |
|---|---|---|
| **K44** | **Een kamer ontstaat vanzelf voor een gedragen onderzoeker, en verder nooit.** Kijken naar een artikel maakt er geen. Sinds §85 vraagt élk artikel of het er een heeft, dus een kamer die op een *lezing* zou ontstaan had het hele archief een beurs gegeven. | bewaakt (`uitdelen.test.ts`) |
| **K45** | **De Keeper mag er met de hand één openen**, op het artikel zelf, en dat is een POST en geen bijwerking. Alleen hij; de knop is absent voor wie er niet op mag drukken en `openRoomFor` weigert hem ook (§80: het slot én de gleuf). **Alleen op een artikel dat een onderzoeker kán zijn** (§90, `mayHoldRoom`). Dat is de soort `investigator`, of een soort waarvan aan deze tafel iemand een artikel draagt, en nooit een soort die `keeper_made` is. De knop vraagt het, en `openRoomFor` vraagt het opnieuw. | bewaakt (`uitdelen.test.ts`, `kamer-ux.spec.ts` zaak 15) |
| **K46** | **Zo'n kamer wordt dicht geboren** (§48) — `private` in beide dials, `created_by` de Keeper — en alleen hij richt hem in, want `ownerOf` geeft niemand. Wordt de onderzoeker later aan een speler gekoppeld, dan is het gewoon diens kamer met wat erin lag. | bewaakt (`uitdelen.test.ts`) |
| **K47** | **De drager beslist of er een kamer gemáákt wordt, niet of er één gevónden wordt.** Élke lezer vindt een kamer die bestaat, ongeacht wie hem draagt. Dit is de fout van §86 en de reden dat hij een regel is. | bewaakt (`uitdelen.test.ts`: "is found by every reader") |
| **K48** | **In de kamer van een ander staat geen winkeldeur en geen *je*.** De winkeldeur staat alleen in je eigen kamer, en draagt die kamer mee (`?kamer=`). In de kamer van een ander ging hij naar jóúw winkel. Wie in andermans kamer iets neerzet of opent, krijgt een melding met de naam (*ligt nu op de plank van Kees*, `boughtThere`, `unlockedThere`), niet *je plank*. Een kamer die niemand draagt, heeft voor de Keeper een eigen zin (`keeperGuestNobody`). ~~**Eén uitzondering staat open:** de kop van het effectenblok (`roomEffects`, *Wat deze kamer je geeft*) zegt nog *je* (zie `CLAUDE.md` §8, ronde 51).~~ **Sinds §93 is er geen uitzondering meer:** in de kamer van een ander zegt de kop *Wat deze kamer Kees geeft* (`roomEffectsOf`), en weghalen zegt *ligt nu in de lade van Kees* (`clearedToDrawerOf`). | bewaakt (`ronde-51-economie.spec.ts`, zaak 3; `ronde-51-economie.test.ts`) |

## 10. Bezit (sinds §93)

| | Regel | |
|---|---|---|
| **K49** | **Wat een kamer bezit, is wat op zijn plekken ligt plus wat in zijn lade ligt.** De lade (`room_drawer`) heeft één rij per exemplaar en niets dat rekent (rule 78). Weghalen legt huisraad in de lade; een gevonden voorwerp gaat terug de wereld in. `placeItem` weigert een speler huisraad dat niet in de lade van díé kamer ligt (*Dat heb je niet. Koop het eerst in de winkel.*); de Keeper mag alles (§80), maar neemt eerst uit de lade. Neerzetten gebeurt alleen op een lege plek. *Wat je al hebt* is `placeCandidates()`, en of een uniek ding al vergeven is, zegt alleen `claimedIds()`: de plekken én de laden. De migratie verzon geen bezit: wat vóór §93 weggehaald werd, is van niemand. | bewaakt (`ronde-54-de-lade.test.ts`, `ronde-54-de-kamer.spec.ts` zaken 2 en 3) |
| **K50** | **Een koop mag vlak erna terug, en dat is een regel erbij.** *Ongedaan maken* staat tien seconden in de melding na een koop (`BUY_UNDO_SECONDS`, met vijf seconden speling op de server). Alleen wie kocht, alleen de laatste koop van dat ding in die kamer, en alleen als het er nog ligt (op zijn plek of in de lade). Het grootboek krijgt een regel `return` (*Leesstoel teruggebracht*) en verandert er geen: het saldo blijft de som (K2). Een teruggebrachte regel krijgt dezelfde sluier als de koop (K9). Na het venster is er geen terugweg: weghalen, en het ligt in je lade. Dit is een correctie, geen terugverkoop (Nick, ronde 54). | bewaakt (`ronde-54-de-lade.test.ts`, `ronde-54-de-kamer.spec.ts` zaak 2) |
| **K51** | **Een winkelrij zonder vrije plek biedt de goedkoopste gesloten plek aan die past** (`ShopItem.opens`, review E5), met de prijs op de knop (K3), in plaats van alleen te zeggen dat er geen plek is. Waar er een vrije plek is, staat er niets extra. | bewaakt (`ronde-54-de-lade.test.ts`) |

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
- **Een kamer die geopend is, gaat niet meer dicht.** Er is geen knop die er
  één weghaalt; dat hoort bij de prullenbak en niet bij een knop op een
  artikel. Zie de restlijst in `CLAUDE.md` §8. Sinds §90 kan hij in elk geval alleen nog
  ontstaan op een artikel dat een onderzoeker kán zijn (K45).
- ~~**De plek-kiezer biedt onder *Wat je al hebt* nog huisraad aan dat niemand
  kocht** (review E1). `placeItem` kijkt naar de plek en de zichtbaarheid,
  niet naar de prijs of het bezit. Nick besliste de oplossing (een lade per
  kamer, een `keeper_made`-slot in `placeItem`, en *Ongedaan maken* in de
  koopmelding) en zette hem in ronde 54.~~ **Gesloten in ronde 54 (§93)**, zie
  K49 en K50.
- **De Keeper kan niets rechtstreeks in een lade leggen.** Hij zet het op een
  plek (gratis, §80) of geeft munten. Zie `CLAUDE.md` §8, ronde 54.
- **"Er is iets misgegaan." staat nog hard in `components/kamer/post.ts`**, als
  terugval wanneer de server geen eigen zin meegeeft. Het bestand valt buiten
  de scope van `kamer-contract.test.ts`.
