/**
 * De inhoud van `npm run seed-wereld` — nepdata, maar Nederlandse nepdata die
 * eruitziet als een archief waar een halfjaar in gespeeld is.
 *
 * Dit bestand bevat *alleen* woorden. Wie wat aan wie hangt, welke velden
 * gevuld worden en hoe de lopende tekst wordt opgebouwd staat in
 * `scripts/seed-wereld.mjs`. Zo kun je hier namen bijschrijven zonder na te
 * hoeven denken over `entry_mentions`, en daar aan de bedrading zonder een
 * zin te hoeven verzinnen.
 *
 * Elke lijst is met opzet langer dan de vijftien die standaard geplaatst
 * worden: `--per 20` pakt er meer uit dezelfde pot, en `--per 8` maakt een
 * klein archief van dezelfde wereld.
 *
 * Alles speelt in Zeeland, februari 1934 en verder — dezelfde wereld als de
 * kleine `seed-demo`, maar dan bewoond.
 */

/* ------------------------------------------------------------- locaties */

export const LOCATIES = [
  ['Middelburg', 'De afgedreven hoofdstad. De Lange Jan staat nog overeind, de Markt ligt onder een zoutnevel die niet optrekt, en er geldt een avondklok waar niemand voor gestemd heeft.', { region: 'Walcheren', type: 'stad' }],
  ['Vlissingen', 'Havenstad met open water aan drie kanten. Aan de kades is het druk op uren die geen eerlijke lading kent.', { region: 'Walcheren', type: 'kust' }],
  ['Veere', 'Half leeg sinds de Drift. De Grote Kerk wordt gebruikt als opslag, en sinds april ook als iets anders.', { region: 'Walcheren', type: 'dorp' }],
  ['Domburg', 'Badplaats zonder badgasten. De strandhuisjes staan er nog, keurig op een rij, en ’s nachts branden er lampen in.', { region: 'Walcheren', type: 'dorp' }],
  ['Westkapelle', 'Dijkdorp aan de zeekant. Wie hier woont slaapt met de luiken dicht en zegt daar niets over.', { region: 'Walcheren', type: 'dorp' }],
  ['De vuurtoren van Westkapelle', 'Een gedrongen bakstenen toren op de dijk. Het licht draait sinds de Drift, al zegt de wachter dat hij het niet heeft opgewonden.', { region: 'Walcheren', type: 'gebouw' }],
  ['Zoutelande', 'Duinen, een kerktoren en een strand dat elke maand breder is dan de kaart toelaat.', { region: 'Walcheren', type: 'dorp' }],
  ['Arnemuiden', 'Vissersdorp met een vloot die niet meer uitvaart en een gilde dat nog elke week vergadert.', { region: 'Walcheren', type: 'dorp' }],
  ['Ritthem', 'Een gehucht van elf huizen. In negen daarvan is de klok blijven staan op tien over drie.', { region: 'Walcheren', type: 'dorp' }],
  ['Fort Rammekens', 'Het oudste zeefort van het land, half onder water. De marechaussee houdt er een post en laat niemand voorbij de tweede poort.', { region: 'Walcheren', type: 'ruïne' }],
  ['De abdijkelders', 'Onder het abdijcomplex ligt meer kelder dan er abdij boven staat. Wat de provincie niet kwijt wil, ligt hier.', { region: 'Middelburg', type: 'gebouw' }],
  ['De Verdronken Polder', 'Zeventienhonderd hectare die in één nacht onderliep zonder dat er een dijk brak.', { region: 'Zuid-Beveland', type: 'anders' }],
  ['Het Zwarte Wiel', 'Een wiel bij de Nieuwlandse dijk. Het water is er warmer dan de sloot eromheen en er groeit niets in.', { region: 'Walcheren', type: 'anders' }],
  ['De Oosterschelde', 'De stroom die Zeeland van het vasteland scheidde. Hij scheidt het nu van niets, en het water erin is warmer dan de zee eromheen.', { region: 'Open water', type: 'kust' }],
  ['De kreekrug bij Nieuwland', 'Een zandrug door de polder waar het pad al vier eeuwen overheen loopt. Sinds februari loopt het er niet meer helemaal overheen.', { region: 'Walcheren', type: 'anders' }],
  ['Het Sloe', 'De geul tussen Walcheren en Zuid-Beveland. Bij laag water staat er iets in dat bij hoog water niet drijft.', { region: 'Open water', type: 'kust' }],
  ['De Seisweg', 'Straat met pensions en één telefooncel. De helft van de kamers is verhuurd aan mensen die niemand heeft zien aankomen.', { region: 'Middelburg', type: 'anders' }],
  ['Nieuw- en Sint Joosland', 'Twee kerkdorpen die één burgemeester delen en sinds maart één begraafplaats te weinig hebben.', { region: 'Walcheren', type: 'dorp' }],
  ['De Kaloot', 'Een strook strand vol fossiel schelpgruis. Er spoelt sinds de Drift ander gruis aan.', { region: 'Zuid-Beveland', type: 'kust' }],
  ['Het gasthuis achter de abdij', 'Achttien bedden, veertien zusters en een nachtlijst die niet in het register komt.', { region: 'Middelburg', type: 'gebouw' }],
];

/* ------------------------------------------------------------- personen */

export const PERSONEN = [
  ['Jacob den Hollander', 'Wachter op de vuurtoren van Westkapelle. Zestig, doof aan één oor, en niet bereid tussen twee en vier uur ’s nachts te slapen.', { occupation: 'Vuurtorenwachter', status: 'levend' }],
  ['Anneke Visser', 'Ingenieur van Rijkswaterstaat, gestuurd om de nieuwe kustlijn in te meten. Nauwkeurig, sceptisch, en steeds minder in staat haar eigen metingen uit te leggen.', { occupation: 'Waterbouwkundige', status: 'levend' }],
  ['Doktor Gerhard Lang', 'Een Duitse oudheidkundige met onberispelijke manieren, een Leica, en aanbevelingsbrieven van drie instellingen die niet bestaan.', { occupation: 'Antiquair', status: 'levend', aliases: 'Der Herr Doktor' }],
  ['Zuster Clasina', 'Houdt het gasthuis achter de abdij. Kent elke naam op het eiland en weet welke daarvan niet meer antwoorden.', { occupation: 'Almoezenierster', status: 'levend' }],
  ['Pier Boone', 'Havenmeester van Vlissingen. Houdt twee journalen bij en laat je eerst het verkeerde zien.', { occupation: 'Havenmeester', status: 'levend' }],
  ['Marinus de Kok', 'Schipper van de ARM-14. Vaart als enige nog voorbij de ton, en zegt niet waarom hij terugkomt.', { occupation: 'Visser', status: 'levend' }],
  ['Willemijn Traas', 'Bedient de telefooncentrale in Middelburg. Hoort gesprekken op lijnen die nergens meer heen lopen.', { occupation: 'Telefoniste', status: 'levend' }],
  ['Kees Bogaert', 'Dijkwerker aan de zeewering. Heeft in maart iets uit de klei gehaald en het niet gemeld.', { occupation: 'Dijkwerker', status: 'levend' }],
  ['Adriana Wisse', 'Geeft les aan de laatste elf kinderen van Ritthem. Houdt bij wat ze tekenen, en sinds mei ook wanneer.', { occupation: 'Onderwijzeres', status: 'levend' }],
  ['Dominee Bartel Neerhoff', 'Preekt sinds de Drift over andere teksten dan die in het boek staan. Zijn kerk zit voller dan ooit.', { occupation: 'Predikant', status: 'levend' }],
  ['Suze Kloosterman', 'Nachtdienst in het gasthuis. Houdt de lijst bij van wie er ’s nachts wakker wordt, en waarvan.', { occupation: 'Verpleegster', status: 'levend' }],
  ['Hendrik Minnaar', 'Rooie Hendrik. Brengt sinds februari dingen het eiland op waar niemand om gevraagd heeft.', { occupation: 'Smokkelaar', status: 'levend', aliases: 'Rooie Hendrik' }],
  ['Mevrouw Sanderse', 'Verhuurt kamers aan de Seisweg. Weet welke gast er niet slaapt en welke er niet ademt.', { occupation: 'Pensionhoudster', status: 'levend' }],
  ['Toon Sturm', 'Wachtmeester bij Fort Rammekens. Voert bevelen uit die per koerier komen en die hij niet mag bewaren.', { occupation: 'Marechaussee', status: 'levend' }],
  ['Het Verdronken Kind', 'In maart uit de Oosterschelde gehaald, warm aan de hand, en tweemaal begraven. Niemand heeft hem opgeëist.', { status: 'dood' }],
  ['Jannetje Goedbloed', 'Baakmeesteres van het Sloe. Vaart de tonnen langs en heeft er in mei één te weinig geteld.', { occupation: 'Baakmeesteres', status: 'vermist' }],
  ['Professor R. van Gilse', 'Leidse geoloog, twee weken op het eiland geweest, en sinds zijn vertrek door niemand meer gezien.', { occupation: 'Geoloog', status: 'vermist' }],
  ['Ko Wisse', 'Broer van de onderwijzeres. Sinds april niet meer aanspreekbaar, en volgens de dokter volkomen gezond.', { occupation: 'Landarbeider', status: 'onbekend' }],
  ['Burgemeester De Meij', 'Bestuurt wat er van de provincie over is vanuit een kelder. Tekent alles, leest niets.', { occupation: 'Burgemeester', status: 'levend' }],
  ['Fräulein Ilse Harnack', 'Reist met het Duitse gezelschap mee als secretaresse. Spreekt beter Zeeuws dan iemand die hier drie weken is.', { occupation: 'Secretaresse', status: 'levend' }],
];

/* ---------------------------------------------------------- onderzoekers */

export const ONDERZOEKERS = [
  ['Cornelis Vermeulen', 'Verslaggever van de Provinciale Zeeuwse Courant. Schrijft alles op en publiceert een derde.', { occupation: 'Journalist', status: 'levend' }],
  ['Dr. Elsje Kramer', 'Arts in het gasthuis. Heeft de lichaamstemperatuur van het Verdronken Kind gemeten en dat verslag nooit ingeleverd.', { occupation: 'Arts', status: 'levend' }],
  ['Bram Ossewaarde', 'Landmeter bij de provincie. Meet liever tweemaal dan dat hij één keer moet uitleggen.', { occupation: 'Landmeter', status: 'levend' }],
  ['Nel Provoost', 'Provinciaal archivaris. Weet welke bladzijde er ontbreekt zonder het register open te slaan.', { occupation: 'Archivaris', status: 'levend' }],
  ['Ir. Steven Duvekot', 'Bruggenbouwer zonder brug. Rekent ’s nachts door wat overdag niet klopte.', { occupation: 'Ingenieur', status: 'levend' }],
  ['Truus Haaij', 'Fotografe. Ontwikkelt haar eigen platen en heeft er één die zij niet aan anderen laat zien.', { occupation: 'Fotografe', status: 'levend' }],
  ['Gijs Roelse', 'Agent te Middelburg. Doet er niet aan mee, tot hij dat wel doet.', { occupation: 'Politieagent', status: 'levend' }],
  ['Machteld van Ostade', 'Folkloriste uit Utrecht. Kwam voor de Witte Wieven en is gebleven om een andere reden.', { occupation: 'Folkloriste', status: 'levend' }],
  ['Jan Kaland', 'Schipper op de Zeeland IV. Kent het Sloe met zijn ogen dicht, wat op dit moment een nadeel is.', { occupation: 'Schipper', status: 'levend' }],
  ['Doortje Meulenberg', 'Bibliothecaresse van de Zeeuwsche Bibliotheek. Leent uit wat ze eerst zelf gelezen heeft.', { occupation: 'Bibliothecaresse', status: 'levend' }],
  ['Bertus Slabbekoorn', 'Smid te Arnemuiden. Maakt wat men hem vraagt en onthoudt wie het vroeg.', { occupation: 'Smid', status: 'levend' }],
  ['Leontine de Ruijter', 'Pianolerares. Heeft een oor voor toonhoogte, wat sinds de Drift een last is geworden.', { occupation: 'Muzieklerares', status: 'levend' }],
  ['Wim Poppe', 'Student geologie, achtergebleven na het vertrek van zijn hoogleraar. Slaapt in het veld.', { occupation: 'Student', status: 'levend' }],
  ['Sien Boogaard', 'Vroedvrouw op Noord-Walcheren. Weet als eerste wat er in de dorpen speelt en zegt er zelden iets van.', { occupation: 'Vroedvrouw', status: 'levend' }],
  ['Ary Nieuwenhuijse', 'Proponent, wachtend op een gemeente. Woont de preken van Neerhoff bij en schrijft ze woordelijk op.', { occupation: 'Proponent', status: 'levend' }],
  ['Rika Steketee', 'Onderwijzeres uit Vlissingen, ingedeeld bij het eerste onderzoek en er nooit meer uit gestapt.', { occupation: 'Onderwijzeres', status: 'levend' }],
  ['Piet Kloet', 'Kraanmachinist in de haven. Tilt wat er getild moet worden en vraagt achteraf.', { occupation: 'Machinist', status: 'levend' }],
  ['Dr. Frans Nijssen', 'Patholoog uit Rotterdam, per boot gekomen en niet meer teruggevaren.', { occupation: 'Patholoog', status: 'vermist' }],
  ['Marie-Louise Tack', 'Kunstenares uit Domburg. Schildert de kust zoals die is, wat inmiddels bewijsmateriaal oplevert.', { occupation: 'Schilderes', status: 'levend' }],
  ['Wout Priem', 'Radiotelegrafist, gedemobiliseerd. Luistert naar banden waar niets op hoort te staan.', { occupation: 'Telegrafist', status: 'levend' }],
];

/* -------------------------------------------------------------- facties */

export const FACTIES = [
  ['De Schorre', 'De schormannen. Smokkelaars vóór de Drift, en sindsdien het dichtste wat het eiland bij een kustwacht heeft.', { alignment: 'menselijk' }],
  ['Het Ahnenerbe-gezelschap', 'Vier Duitsers met meetapparatuur, een onbeperkt budget en geen enkele belangstelling voor meten.', { alignment: 'menselijk' }],
  ['De Kerkeraad van Middelburg', 'Vergadert wekelijks over zaken die niet in de notulen komen. Heeft in 1699 een verbod uitgevaardigd dat nooit is ingetrokken.', { alignment: 'menselijk' }],
  ['Rijkswaterstaat Zeeland', 'Meet, tekent, rapporteert en krijgt sinds februari op elk rapport hetzelfde antwoord: nogmaals meten.', { alignment: 'menselijk' }],
  ['De Broederschap van het Stille Water', 'Zegt al vier eeuwen te bestaan. Er is geen enkel bewijs voor, en drie mensen die het bevestigen.', { alignment: 'cthulhiaans' }],
  ['Het Vissersgilde van Arnemuiden', 'Vergadert nog elke donderdag, al vaart er niemand meer uit. Beslist wie er wél mag.', { alignment: 'menselijk' }],
  ['De Koninklijke Marechaussee, brigade Walcheren', 'Twaalf man, één telefoon en bevelen die per koerier komen uit een land dat er niet meer naast ligt.', { alignment: 'menselijk' }],
  ['Het Genootschap voor Zeeuwsche Oudheden', 'Verzamelt sinds 1769 wat er uit de klei komt. Sinds februari komt er te veel.', { alignment: 'menselijk' }],
  ['De Nachtwacht van Veere', 'Zes mannen met stormlampen. Lopen elke nacht dezelfde ronde en zeggen tegen niemand wat ze tellen.', { alignment: 'menselijk' }],
  ['De Zwarte Kreek', 'Wat er van het smokkelnetwerk over is nadat De Schorre fatsoenlijk werd. Rooie Hendrik regelt het.', { alignment: 'menselijk' }],
  ['De Zusters van de Almoes', 'Veertien zusters, achttien bedden en een lijst die niet in het register komt.', { alignment: 'menselijk' }],
  ['Het havenmeesterskantoor Vlissingen', 'Registreert alles wat aanlegt. Tweemaal, in twee boeken, met verschillende uitkomsten.', { alignment: 'menselijk' }],
  ['De Vrije Polderbond', 'Boeren die de dijken zelf zijn gaan bewaken toen bleek dat niemand anders dat deed.', { alignment: 'menselijk' }],
  ['Het Comité voor Terugkeer', 'Vergadert in de abdij over de vraag hoe men terugvaart naar een vasteland dat er niet is.', { alignment: 'menselijk' }],
  ['De Stille Loge', 'Bestaat volgens de burgemeester niet. Vergadert volgens de nachtwacht op dinsdag.', { alignment: 'onbekend' }],
  ['De diepe vrienden', 'Zo noemen de vissers wat er meevaart. Of het een partij is, is precies de vraag.', { alignment: 'cthulhiaans' }],
  ['De ploeg van Bogaert', 'Elf dijkwerkers die in maart iets hebben opgegraven en er sindsdien over zwijgen als één man.', { alignment: 'menselijk' }],
  ['De Provinciale Zeeuwse Courant', 'Verschijnt nog dagelijks, op half formaat, met een witte kolom op pagina twee.', { alignment: 'menselijk' }],
];

/* ------------------------------------------------------------- families */

export const FAMILIES = [
  ['De familie Boone', 'Havenvolk sinds mensenheugenis. Wie in Vlissingen iets van de kade af wil hebben, gaat langs een Boone.', { status: 'bloeiend', wapenspreuk: 'Wij tellen de lading twee keer' }],
  ['De familie Wisse', 'Boeren op de kreekrug bij Nieuwland. Sinds april één zoon te veel aan tafel en één te weinig aan het werk.', { status: 'tanend', wapenspreuk: 'Het land houdt ons' }],
  ['De familie Traas', 'Middelburgse ambtenarenfamilie. Drie generaties op de provincie, en alle drie met een la die niet opengaat.', { status: 'bloeiend', wapenspreuk: 'In stilte gediend' }],
  ['De familie Minnaar', 'Berucht van Ritthem tot de Kaloot. Rooie Hendrik is de vierde op rij die het eiland op brengt wat er niet op hoort.', { status: 'bloeiend', wapenspreuk: 'Wat het water brengt is van ons' }],
  ['Het geslacht Van Gilse', 'Regentenfamilie uit Veere, geslonken tot een naam op drie gevelstenen en één vermiste geoloog.', { status: 'vervallen', wapenspreuk: 'Boven het tij' }],
  ['De familie Goedbloed', 'Baakmeesters van het Sloe, vader op zoon, sinds de tonnen er liggen. De laatste is in mei niet teruggevaren.', { status: 'tanend', wapenspreuk: 'Wij houden het licht' }],
  ['De familie Neerhoff', 'Predikantenfamilie. Vier dominees in honderd jaar, en de vierde preekt sinds de Drift uit een ander boek.', { status: 'bloeiend', wapenspreuk: 'Het woord blijft' }],
  ['Het huis Ossewaarde', 'Landmeters en dijkgraven van Zuid-Beveland. De metingen van 1898 kloppen nog; die van dit jaar niet.', { status: 'bloeiend', wapenspreuk: 'Gemeten en vastgelegd' }],
  ['De familie Sturm', 'Van oorsprong Vlaams, aangespoeld in 1809 en nooit meer weggegaan. Dienen wie er dient.', { status: 'tanend', wapenspreuk: 'Waar men ons zet' }],
  ['Het geslacht Kloosterman', 'Uitgestorven in de mannelijke lijn, zegt het register. In het gasthuis loopt een Kloosterman nachtdienst.', { status: 'uitgestorven', wapenspreuk: 'Wij waken' }],
  ['De familie De Kok', 'Vissers uit Arnemuiden. Elf begrafenissen sinds februari, en negen daarvan zonder lichaam.', { status: 'tanend', wapenspreuk: 'De zee geeft terug' }],
  ['Het huis Van Ostade', 'Utrechts geslacht met een tak op Walcheren die niemand op het eiland ooit heeft gezien.', { status: 'bloeiend', wapenspreuk: 'Wat men vertelt bewaren wij' }],
];

/* ------------------------------------------------------------- relieken */

export const RELIEKEN = [
  ['De Getijklok', 'Een bronzen klok, opgebaggerd voor Westkapelle, groen van ouderdom en warm op het hele uur, of iemand hem nu luidt of niet.', { origin: 'Opgebaggerd op de Westkapelse platen' }],
  ['Het journaal van de wachter', 'Het register van alles waar de bundel van Westkapelle sinds de Drift overheen is gegaan.', { origin: 'Westkapelle' }],
  ['De Leica van Lang', 'Een toestel waarmee dingen zijn gefotografeerd die niet ontwikkelden, en één ding dat tweemaal ontwikkelde.', { origin: 'Wetzlar, 1932' }],
  ['De Zoutspiegel', 'Een spiegel van gestold zeezout uit de abdijkelder. Wat erin staat is een tel te laat.', { origin: 'Abdijkelder, vindjaar onbekend' }],
  ['Het kompas van de abdijtoren', 'Elf graden verdraaid sinds de nacht van de Drift, en niet meer te ijken.', { origin: 'Lange Jan, Middelburg' }],
  ['De peilstok van Nieuwland', 'Een eiken stok met vier eeuwen kerven. De onderste kerf staat op een diepte die er niet was.', { origin: 'Nieuwlandse dijk' }],
  ['Het doopvont van Veere', 'Loopt sinds april vanzelf vol met water dat zout is en niet uit de put komt.', { origin: 'Grote Kerk, Veere' }],
  ['De Zwarte Kaart', 'Een zeekaart uit 1687 die diepten aangeeft die pas sinds februari kloppen.', { origin: 'Nalatenschap Van Gilse' }],
  ['Het beeld van de Stille Vrouw', 'Kalksteen, levensgroot, gezicht weggesleten. Staat elke ochtend een halve slag anders.', { origin: 'Opgegraven in de Verdronken Polder' }],
  ['De scheepsbel van de Zeeland IV', 'Geluid dat op vier plaatsen tegelijk te horen is, en op de boot zelf niet.', { origin: 'Vlissingen' }],
  ['De reliekhouder van Sint Odulphus', 'Tin, verzegeld, en volgens de kerkeraad al sinds 1699 leeg. Hij weegt anders.', { origin: 'Kerkeraad van Middelburg' }],
  ['De nachtlantaarn van Domburg', 'Brandt zonder olie. De vlam wijst niet omhoog maar zeewaarts.', { origin: 'Strandhuisje 7, Domburg' }],
  ['Het verzegelde vat', 'Eikenhout, banden van lood, en aan de binnenkant iets dat op kloppen antwoordt.', { origin: 'Aangespoeld bij De Kaloot' }],
  ['De sleutel zonder slot', 'Achttiende-eeuws, ongebruikt, en warm in de hand van wie hem het langst vasthoudt.', { origin: 'Onbekend' }],
  ['Het Boek van de Zeven Polders', 'Een handschrift in het Zeeuws dat zeven polders opsomt. Er zijn er zes.', { origin: 'Genootschap voor Zeeuwsche Oudheden' }],
  ['De klok van Ritthem', 'Uurwerk van de dorpskerk, uitgebouwd en meegenomen. De toren slaat nog steeds.', { origin: 'Ritthem' }],
  ['Het net van De Kok', 'Vissersnet met een scheur van vier meter, van binnenuit.', { origin: 'ARM-14' }],
  ['Het zegel van de Broederschap', 'Was, zwart, een golf met elf strepen erdoor. Niemand geeft toe het te herkennen.', { origin: 'Onbekend' }],
];

/* ----------------------------------------------------------- voorwerpen */

export const VOORWERPEN = [
  ['Een doorweekt notitieboekje', 'Vijftig bladzijden, veertig leesbaar, en op de laatste hetzelfde woord veertien keer.', {}],
  ['Een koperen uniformknoop', 'Van geen enkel korps dat de marechaussee kent.', {}],
  ['Een fles zonder etiket', 'Halfvol. De inhoud verdampt niet en ruikt naar de Kaloot bij laag water.', {}],
  ['Een verzegelde brief aan G. Lang', 'Duitse frankering, Nederlandse stempel, en een datum van volgende maand.', {}],
  ['Een handvol zwarte kiezels', 'Warm, ook na een nacht op de vensterbank.', {}],
  ['Een kinderschoen, maat 28', 'Rechts. De linker is er ook, maar niet op dezelfde plek gevonden.', {}],
  ['Een geknakte peilstok', 'Op elf centimeter onder de waterlijn afgebroken, en niet door iets hards.', {}],
  ['Een onontwikkeld fotorolletje', 'Zes opnamen. De zevende is er ook, en die is er niet ingedraaid.', {}],
  ['Een houten naambord: ZEELAND IV', 'Van de boot geschroefd, niet afgebroken.', {}],
  ['Een bos sleutels aan een kurk', 'Elf sleutels. Zeven daarvan passen op deuren in de abdijkelder.', {}],
  ['Een zakdoek met monogram A.V.', 'Zout, opgedroogd, en met een randje dat geen zeewater is.', {}],
  ['Een blikken trommel met zout', 'Grof zeezout. In het midden een holte in de vorm van een hand.', {}],
  ['Een gescheurde vaarvergunning', 'Op naam van een schipper die in het register van 1931 niet voorkomt.', {}],
  ['Een horloge dat achteruitloopt', 'Elf minuten per etmaal, meetbaar, en niet te repareren.', {}],
  ['Een dodenmasker van gips', 'Naar het gezicht van iemand die volgens het gasthuis nog leeft.', {}],
  ['Een schoolschrift uit Ritthem', 'Rekensommen tot bladzijde negen, en daarna tekeningen.', {}],
  ['Een loden peilgewicht', 'Met touw van zestig vadem eraan, waarvan de laatste tien nooit nat zijn geworden.', {}],
  ['Een half opgebrande kaars', 'Uit de Grote Kerk van Veere. De vlam heeft naar beneden gebrand.', {}],
];

/* ---------------------------------------------------------------- clues */

export const CLUES = [
  ['De tweede peiling', 'Twee dieptemetingen, twaalf minuten uit elkaar, aan dezelfde ton: elf meter, en daarna driehonderdveertig.', {}],
  ['Het warme lijk', 'Eenendertig graden aan de kade, vier uur nadat het uit het water kwam.', {}],
  ['Het ongewonden licht', 'De lamp van Westkapelle draait elf weken. Het uurwerk is voor de Drift voor het laatst opgewonden.', {}],
  ['De elf graden', 'Het kompas op de abdijtoren, het kompas van de ARM-14 en dat van de marechaussee wijzen alle drie elf graden verkeerd. Dezelfde elf.', {}],
  ['De stilte op lijn vier', 'Tussen twee en vier uur ’s nachts is lijn vier bezet. Er is geen abonnee op lijn vier.', {}],
  ['De tekeningen van Ritthem', 'Elf kinderen, negen tekeningen, en op alle negen dezelfde figuur op de dijk.', {}],
  ['Het tweede journaal', 'Het boek dat de havenmeester niet laat zien, en waarin schepen staan die het eerste niet kent.', {}],
  ['De ontbrekende ton', 'De baakmeesteres telde in mei zeventien tonnen in het Sloe. Er liggen er achttien.', {}],
  ['Het zout in de longen', 'Zeewater met een zoutgehalte dat nergens rond het eiland voorkomt.', {}],
  ['De brief die tweemaal kwam', 'Zelfde envelop, zelfde inhoud, twee dagen na elkaar, en de tweede eerder gepost.', {}],
  ['De voetsporen op het droge', 'Na het Holle Tij van april: sporen die de zeebodem op lopen en niet terug.', {}],
  ['Het register zonder bladzijde veertig', 'Netjes uitgesneden, met een mes, en het handschrift op 39 en 41 loopt door.', {}],
  ['De vier gelijke handschriften', 'Vier verklaringen van vier mensen die elkaar niet kennen, in hetzelfde handschrift.', {}],
  ['Het geluid onder de dijk', 'Bij Nieuwland, op vijf meter diepte, driemaal per etmaal, en niet op de getijden.', {}],
  ['De foto die tweemaal ontwikkelde', 'Dezelfde plaat, twee beelden. Op het tweede staat er iemand meer op de dijk.', {}],
  ['De warme laag', 'Een waterlaag van zeven meter dik in de Oosterschelde die vier graden te warm is en niet wil mengen.', {}],
  ['Het ontbrekende uur', 'Tussen 03:10 en 04:10 op 9 februari heeft geen enkele klok op het eiland geteld.', {}],
  ['De naamlijst van Clasina', 'Vierendertig namen. Zeven ervan staan in het bevolkingsregister als overleden.', {}],
];

/* ------------------------------------------------------- abnormaliteiten */

export const ABNORMALITEITEN = [
  ['Het Holle Tij', 'Tweemaal per maand trekt het water bij Westkapelle verder terug dan enige kaart toelaat, en het komt negen uur niet terug.', { category: 'onbekend', threat: 'Wat er over het droge naar binnen loopt' }],
  ['De Witte Wieven', 'Nevelvrouwen van de binnenpolders. Ouder dan de Drift, en aanzienlijk bedrijviger sindsdien.', { category: 'folkloristisch', threat: 'Leidt reizigers van de dijkweg af' }],
  ['De zoutnevel', 'Hangt over de Markt en trekt niet op. Wie er een half uur in staat proeft nog dagen zout.', { category: 'onbekend', threat: 'Vreet metaal en geheugen' }],
  ['Het kind dat terugkomt', 'Tweemaal begraven, en tweemaal boven de grond aangetroffen, telkens dichter bij het water.', { category: 'cthulhiaans', threat: 'Loopt naar de Oosterschelde' }],
  ['De stemmen op de centrale', 'Op lijn vier, tussen twee en vier, in een taal die de telefoniste woordelijk kan naspreken en niet begrijpt.', { category: 'onbekend', threat: 'Wie luistert, spreekt mee' }],
  ['De trage spiegel', 'Elke spiegel binnen tien passen van de Zoutspiegel loopt een tel achter.', { category: 'cthulhiaans', threat: 'Het beeld gaat door als je weggaat' }],
  ['Het licht op de zeekant', 'Een tweede bundel op zee, die de bundel van de vuurtoren precies tegemoet draait.', { category: 'onbekend', threat: 'Trekt schepen de platen op' }],
  ['De verdronken processie', 'Bij eb in het Sloe: vierendertig figuren die van west naar oost lopen en de dijk niet halen.', { category: 'cthulhiaans', threat: 'Wie meeloopt komt niet aan de overkant' }],
  ['De man van elf graden', 'Een gestalte die altijd elf graden naast de kijkrichting staat, hoe je je ook draait.', { category: 'onbekend', threat: 'Komt dichterbij als je hem recht aankijkt' }],
  ['Het warme water', 'Vier graden te warm, zeven meter dik, en het mengt niet met de laag eromheen.', { category: 'onbekend', threat: 'Wat erin zwemt hoeft niet boven te komen' }],
  ['De klok van Ritthem', 'De toren slaat, ook nu het uurwerk eruit is. Altijd tien over drie.', { category: 'folkloristisch', threat: 'Wie de slag telt raakt een uur kwijt' }],
  ['De vloed die niet kwam', 'Op 28 april is het water in Vlissingen niet opgekomen. Elders wel.', { category: 'onbekend', threat: 'Het staat ergens anders' }],
  ['De zwemmers', 'Bij nacht, honderd meter uit de kust, en ze zwemmen tegen de stroom in zonder vooruit te komen.', { category: 'cthulhiaans', threat: 'Ze komen aan land bij het Holle Tij' }],
  ['Het ademen onder de klei', 'Bij Nieuwland, op vijf meter, drie keer per etmaal, en niet op de getijden.', { category: 'cthulhiaans', threat: 'De dijk zakt waar het ademt' }],
  ['De tweede maan', 'Op zeven nachten in mei stond er iets naast de maan dat geen ster was en dat op de foto wél staat.', { category: 'onbekend', threat: 'Het tij volgt hem, niet de maan' }],
  ['De naamloze zondag', 'Eén keer per maand mist de week een dag, en niemand mist hem.', { category: 'onbekend', threat: 'Wie hem wél merkt is de volgende keer weg' }],
  ['Het omgekeerde branden', 'Kaarsen die naar beneden branden, in de kerk van Veere en nergens anders.', { category: 'folkloristisch', threat: 'De was loopt naar de deur' }],
  ['De diepe vriend', 'Wat er meevaart met wie voorbij de ton gaat. De vissers noemen het zo en zeggen er verder niets over.', { category: 'cthulhiaans', threat: 'Het vraagt niets terug, tot het dat wel doet' }],
];

/* ------------------------------------------------------ gebeurtenissen */
/* [naam, korte omschrijving, jaar, maand, dag, precisie]                  */

export const GEBEURTENISSEN = [
  ['De Drift', 'In de nacht van 9 februari 1934 was de provincie Zeeland, volgens elk beschikbaar instrument, ergens anders.', 1934, 2, 9, 'day'],
  ['De eerste peiling van de Oosterschelde', 'Rijkswaterstaat vaart uit om de nieuwe kustlijn in te meten en komt terug met twee getallen.', 1934, 3, 3, 'day'],
  ['Het lichaam bij de Nieuwe Haven', 'Een jongen uit het water gehaald, warm aan de hand, vier uur na de vondst nog eenendertig graden.', 1934, 3, 14, 'day'],
  ['De begrafenis, en de tweede', 'Drie dagen na de eerste. De tweede is ’s nachts en zonder aangifte.', 1934, 3, 17, 'day'],
  ['Het Holle Tij van april', 'Negen uur droge zeebodem, en sporen die de bodem op lopen en niet terug.', 1934, 4, 2, 'day'],
  ['De aankomst van het Duitse gezelschap', 'Vier heren met meetapparatuur leggen aan te Vlissingen en huren de hele Seisweg leeg.', 1934, 4, 11, 'day'],
  ['De storm die niet doorkwam', 'Aangekondigd, gemeten, en niet aangekomen. Het water is die avond niet opgezet.', 1934, 4, 28, 'day'],
  ['De avondklok', 'De burgemeester tekent, de kerkeraad stelt op, en niemand kan zeggen wie het gevraagd heeft.', 1934, 5, 5, 'day'],
  ['Het verdwijnen van de ARM-9', 'Uitgevaren met vier man, teruggevonden zonder, met de netten binnenboord en de motor warm.', 1934, 5, 19, 'day'],
  ['De inval bij Fort Rammekens', 'De marechaussee sluit de tweede poort en laat de eigen wachtmeester er niet meer door.', 1934, 6, 3, 'day'],
  ['De preek van Neerhoff', 'Anderhalf uur, uit het hoofd, over een tekst die in geen enkele bijbel op het eiland staat.', 1934, 6, 10, 'day'],
  ['De nacht dat de centrale zweeg', 'Van twee tot vier geen enkele verbinding, behalve lijn vier.', 1934, 6, 22, 'day'],
  ['De opgraving in de Verdronken Polder', 'Elf dijkwerkers, één ploegbaas, en een vondst die niet in het proces-verbaal komt.', 1934, 7, 7, 'day'],
  ['De veiling in de abdijkelder', 'Niet aangekondigd, wel afgelopen. Er is contant betaald, in guldens, altijd precies.', 1934, 7, 21, 'day'],
  ['De watersnood van 1682', 'De laatste keer dat de Verdronken Polder onderliep. Toen brak er wel een dijk.', 1682, 1, 26, 'day'],
  ['Het verbod van de kerkeraad', 'Een besluit uit 1699 dat nooit is ingetrokken en waarvan de tekst ontbreekt.', 1699, 9, 1, 'month'],
  ['De eerste vermelding van de Broederschap', 'Eén regel in een rekening van het Genootschap, en verder niets.', 1769, 1, 1, 'year'],
  ['Het vertrek van Van Gilse', 'De hoogleraar gaat aan boord in Vlissingen. De boot komt aan, hij niet.', 1934, 5, 2, 'day'],
];

/* -------------------------------------------------------- overlevering */

export const OVERLEVERING = [
  ['Het lied van de zeven polders', 'Een telrijmpje dat zeven polders opsomt. Er zijn er zes, en de zevende wordt altijd het laatst gezongen.'],
  ['Sint Odulphus en de zeven golven', 'De heilige die de zee zeven keer terugstuurde en de zevende keer meeging.'],
  ['Waarom men op Walcheren geen visgraat verbrandt', 'Omdat het rookt naar de kant waar het vandaan kwam, zeggen ze, en omdat het antwoordt.'],
  ['De vrouw van het Zwarte Wiel', 'Ze staat tot haar knieën in het water en vraagt de tijd. Wie hem geeft, raakt hem kwijt.'],
  ['Het verbod van de kerkeraad, 1699', 'Wat er verboden werd staat er niet bij. Dat het niet is ingetrokken wel.'],
  ['De naamloze zondag', 'Eén zondag per maand telt niet mee. Wie hem uitrekent moet het aan niemand vertellen.'],
  ['Wat men zegt over de Oosterschelde', 'Dat het water er warm is omdat er iets in ademt, en dat men dat niet hardop zegt.'],
  ['De drie kloppen', 'Op de deur, na middernacht. De eerste is de wind, de tweede is de wind, de derde moet je niet openen.'],
  ['Het zoutgebed', 'Vier regels, gemompeld boven een handvol zout, tegen wat er van zee komt.'],
  ['De ommegang van Veere', 'Vroeger met kaarsen om de kerk. Sinds april loopt men de andere kant op.'],
  ['De legende van de Zeeland IV', 'Een boot die driemaal is vergaan en driemaal is aangelegd, telkens met een andere bemanning.'],
  ['Het gebruik van de omgekeerde schoen', 'Eén schoen omgekeerd voor de drempel, zodat wat binnenkomt niet weet waar het vandaan kwam.'],
  ['Wat de vissers de diepe vriend noemen', 'Niet een naam maar een omschrijving, en zelfs die zeggen ze liever niet twee keer achter elkaar.'],
  ['De rijmpjes van Ritthem', 'Kinderversjes die overal hetzelfde zijn, behalve de laatste regel, die daar over een figuur op de dijk gaat.'],
  ['De regel van de elf graden', 'Kijk nooit recht naar wat naast je staat, zeggen de oude vissers, want dan staat het voor je.'],
  ['Het verhaal van de zeven kerven', 'De peilstok van Nieuwland heeft er zes gehad, tot iemand er in maart een zevende in sneed.'],
  ['De ballade van de baakmeesteres', 'Achttien tonnen, zeventien lichten, en een vrouw die telt tot ze niet meer terugkomt.'],
  ['Waarom Veere zijn klokken ’s nachts vastzet', 'Sinds 1682, en niemand die het nog uitlegt aan wie het vraagt.'],
];

/* ------------------------------------------------------ sessierapporten */
/* [titel, korte omschrijving, sessienummer, jaar, maand, dag]             */

export const SESSIES = [
  ['Sessie 1 — De nacht van de Drift', 'Kennismaking, de eerste ochtend zonder vasteland, en de vraag wie er nu eigenlijk gaat over wat.', 1, 2026, 2, 14],
  ['Sessie 2 — Een lamp die niemand opwond', 'Naar Westkapelle, de wachter gesproken, en het journaal niet te zien gekregen.', 2, 2026, 2, 28],
  ['Sessie 3 — Twee getallen aan dezelfde ton', 'Meegevaren met Rijkswaterstaat. Terug met een meting die niemand wil tekenen.', 3, 2026, 3, 14],
  ['Sessie 4 — De jongen aan de kade', 'Het lichaam, de temperatuur, en het verslag dat niet is ingeleverd.', 4, 2026, 3, 28],
  ['Sessie 5 — Tweemaal begraven', 'Nachtwerk op het kerkhof van Nieuwland, tegen de zin van de dominee in.', 5, 2026, 4, 11],
  ['Sessie 6 — Negen uur droog', 'Het Holle Tij afgewacht en het niet bij afwachten gelaten.', 6, 2026, 4, 25],
  ['Sessie 7 — Heren met apparatuur', 'De Duitsers gevolgd van de kade naar de Seisweg, en van de Seisweg naar de abdij.', 7, 2026, 5, 9],
  ['Sessie 8 — Lijn vier', 'Een nacht in de centrale, met toestemming die niemand bevoegd was te geven.', 8, 2026, 5, 23],
  ['Sessie 9 — De tweede poort', 'Fort Rammekens, en wat de wachtmeester niet mocht bewaren.', 9, 2026, 6, 6],
  ['Sessie 10 — De preek', 'Woordelijk meegeschreven, en achteraf regel voor regel nagezocht.', 10, 2026, 6, 20],
  ['Sessie 11 — Elf man en een ploegbaas', 'De opgraving in de Verdronken Polder, en de vondst die niet in het proces-verbaal kwam.', 11, 2026, 7, 4],
  ['Sessie 12 — Contant, in guldens, altijd precies', 'De veiling in de abdijkelder, van achter een pilaar.', 12, 2026, 7, 18],
  ['Sessie 13 — Zeventien lichten', 'Het Sloe langs, tonnen tellen, en de baakmeesteres niet meer aantreffen.', 13, 2026, 8, 1],
  ['Sessie 14 — De foto die tweemaal ontwikkelde', 'Een avond in de donkere kamer, en een tweede gestalte op de dijk.', 14, 2026, 8, 15],
  ['Sessie 15 — Wat er over het droge kwam', 'Het Holle Tij van augustus. Niet iedereen is terug van de dijk gekomen.', 15, 2026, 8, 29],
  ['Sessie 16 — Het ontbrekende uur', 'Naspel: kloklijsten vergeleken, en een uur gevonden dat nergens geteld is.', 16, 2026, 9, 12],
];

/* --------------------------------------------------------------- zinnen */
/**
 * Lopende tekst. `%A` en `%B` worden vervangen door een chip naar een echt
 * artikel, en `a:` / `b:` zeggen uit welke soort dat artikel gekozen mag
 * worden.
 *
 * Die twee sleutels zijn niet optioneel. Zonder hen trekt de bouwer een
 * willekeurig artikel uit de hele pot, en dan staat er "wie iets wil regelen
 * bij Een koperen uniformknoop" — grammaticaal vlekkeloos en volslagen
 * onzin, wat precies het soort testdata is waar je niet naar wíl kijken.
 * Meerdere soorten mogen: `a: ['character', 'investigator']`. Bestaat een
 * genoemde soort niet in dit archief (een Keeper mag er een weggooien), dan
 * valt de bouwer terug op de hele pot — een rare zin is minder erg dan een
 * lege tekst.
 *
 * Een zin zonder plaatshouder is er om de alinea's niet allemaal een rij
 * links te laten zijn.
 */
export const ZINNEN = {
  location: [
    { t: 'Wie hier iets wil weten begint bij %A, en wie iets wil regelen bij %B.', a: 'character', b: 'faction' },
    { t: 'Sinds de Drift valt de post hier één keer per week, en dan nog met gaten.' },
    { t: 'De provincie noemt het bewoond gebied; de marechaussee noemt het anders.' },
    { t: 'Van %A is dit op een heldere dag te zien, wat volgens de kaart niet zou moeten kunnen.', a: 'location' },
    { t: '%A heeft hier in maart iets opgetekend en er sindsdien niet meer over gesproken.', a: ['character', 'investigator'] },
    { t: 'Het water staat hier hoger dan het peil van vorig jaar, en niemand heeft de dijk aangeraakt.' },
    { t: 'Er wordt hier niet gevaren na zonsondergang, en dat was voor februari al zo.' },
    { t: 'Van hieruit is %A een uur lopen over de dijk, of twintig minuten als het droogvalt.', a: 'location' },
    { t: 'Sinds %A komt men hier alleen nog overdag.', a: 'event' },
    { t: 'Wat men hier over %A vertelt, vertelt men nergens anders zo.', a: 'lore' },
  ],
  character: [
    { t: 'Te vinden in %A, meestal, en anders bij %B.', a: 'location', b: 'faction' },
    { t: 'Praat met wie het vraagt, maar niet over dezelfde dingen tweemaal.' },
    { t: 'Staat bij %A in het krijt, en dat is in dit geval geen beeldspraak.', a: 'faction' },
    { t: 'Was er bij %A, en is daar sindsdien over gaan zwijgen.', a: 'event' },
    { t: 'Heeft %A gezien op een moment dat dat niet kon, en houdt vol dat het zo was.', a: 'abnormality' },
    { t: 'Wordt door %A vertrouwd, wat op dit eiland een aanbeveling en een waarschuwing tegelijk is.', a: 'character' },
    { t: 'Draagt sinds april altijd zout in de jaszak. Vraag er niet naar.' },
    { t: 'Heeft %A onder zich gehad, al zal niemand dat op papier bevestigen.', a: 'object' },
  ],
  investigator: [
    { t: 'Ingedeeld bij het onderzoek naar %A, en er niet meer uitgestapt.', a: 'abnormality' },
    { t: 'Werkt het liefst alleen, wat op dit eiland een slecht plan is en toch gebeurt.' },
    { t: 'Heeft %A leren kennen tijdens het eerste onderzoek en houdt contact.', a: 'character' },
    { t: 'Houdt een eigen dossier bij, buiten het archief om.' },
    { t: 'Slaapt slecht sinds %A, en zegt dat het aan het zout ligt.', a: 'event' },
    { t: 'Kent %A van vroeger, van voor de Drift, toen dat nog iets betekende.', a: 'investigator' },
    { t: 'Was aanwezig bij %A en heeft het verslag ervan geschreven.', a: 'session' },
  ],
  family: [
    { t: 'Woont sinds mensenheugenis in %A, en is daar niet weg te denken.', a: 'location' },
    { t: 'Het hoofd van de familie is %A, of dat wordt althans op straat gezegd.', a: 'character' },
    { t: 'De naam staat op drie gevelstenen en in geen enkel kerkregister van na de Drift.' },
    { t: 'Ligt sinds de Drift overhoop met %A, en niemand wil nog uitleggen waarover.', a: 'faction' },
    { t: 'Wat er in %A gebeurde wordt binnen de familie niet besproken.', a: 'event' },
    { t: 'Volgens %A loopt er iets in de bloedlijn dat er niet in hoort.', a: 'lore' },
    { t: 'Er is in maart een %A op zolder gevonden die volgens de erfgenamen nooit van hen is geweest.', a: 'object' },
  ],
  faction: [
    { t: 'Vergadert waar %A het zegt, en niet waar het in de notulen staat.', a: 'character' },
    { t: 'Sinds de Drift meer macht dan bevoegdheid, en dat verschil wordt kleiner.' },
    { t: '%A spreekt namens hen in het openbaar. Wie er binnenskamers spreekt is een andere vraag.', a: 'character' },
    { t: 'Heeft belang bij %A, al zullen ze dat in die woorden nooit toegeven.', a: 'object' },
    { t: 'Wordt door de burgemeester getolereerd omdat er geen alternatief is.' },
    { t: 'Onderhoudt een verstandhouding met %A die niemand op papier wil zetten.', a: 'faction' },
    { t: 'Komt bijeen in %A, op uren dat er verder niemand is.', a: 'location' },
  ],
  object: [
    { t: 'Ligt op dit moment in %A, achter twee sloten en een handtekening.', a: 'location' },
    { t: '%A heeft er tweemaal een bod op gedaan, en beide keren contant.', a: 'character' },
    { t: 'Gevonden door %A, en pas een week later gemeld.', a: ['character', 'investigator'] },
    { t: 'Weegt meer dan het materiaal toelaat. Dat is nagemeten.' },
    { t: 'Reageert op het getij, wat voor een voorwerp van brons geen normale eigenschap is.' },
    { t: 'Wordt in %A genoemd, eeuwen voordat het werd opgegraven.', a: 'lore' },
    { t: 'Sinds %A staat het onder toezicht van de marechaussee.', a: 'event' },
  ],
  item: [
    { t: 'Gevonden bij %A, en niet op de plek waar het volgens iedereen had moeten liggen.', a: 'location' },
    { t: 'In beslag genomen, geregistreerd, en daarna in het dossier gebleven.' },
    { t: '%A heeft het als eerste in handen gehad en er iets aan veranderd voordat het werd opgeschreven.', a: 'investigator' },
    { t: 'Onbeduidend, tot het naast %A wordt gelegd.', a: 'clue' },
    { t: 'Ruikt naar zout dat niet van hier is.' },
    { t: 'Aangetroffen tijdens %A, in een la die al doorzocht heette.', a: 'session' },
  ],
  clue: [
    { t: 'Vastgesteld door %A, en niet ingeleverd.', a: 'investigator' },
    { t: 'Twee onafhankelijke waarnemingen, en beide keren hetzelfde getal.' },
    { t: 'Wijst naar %A, of naar iets dat zich daarvoor uitgeeft.', a: 'abnormality' },
    { t: 'Op zichzelf niets. Naast %A gelegd wordt het iets anders.', a: 'clue' },
    { t: 'Wie dit narekent komt op hetzelfde uit, wat het probleem alleen maar groter maakt.' },
    { t: 'Gemeld door %A, die er verder niets over kwijt wil.', a: 'character' },
  ],
  abnormality: [
    { t: 'Voor het eerst waargenomen bij %A, en daarna op vier andere plekken.', a: 'location' },
    { t: 'Volgt geen getij, geen maan en geen weer, en toch is het regelmatig.' },
    { t: '%A heeft er een verklaring voor die niemand overneemt.', a: ['character', 'investigator'] },
    { t: 'Verschijnt niet als er meer dan drie mensen kijken.' },
    { t: 'Wie het meemaakt en erover praat, maakt het de tweede keer alleen mee.' },
    { t: 'In %A staat het beschreven zoals het zich nu gedraagt.', a: 'lore' },
    { t: 'Sinds %A vaker gezien dan in de tien jaar ervoor.', a: 'event' },
  ],
  event: [
    { t: 'Vastgelegd in %A, en in geen enkel officieel stuk.', a: 'session' },
    { t: 'Er waren getuigen. Er zijn er nu minder.' },
    { t: 'Wat er die avond in %A gebeurde is op drie manieren opgeschreven, alle drie door dezelfde hand.', a: 'location' },
    { t: 'De marechaussee kwam een dag later, en toen was er niets meer te zien.' },
    { t: '%A was erbij en heeft er daarna twee weken niets over gezegd.', a: 'character' },
    { t: 'Sindsdien is %A niet meer waargenomen zoals daarvoor.', a: 'abnormality' },
  ],
  lore: [
    { t: 'Opgetekend te %A, waar men het nog voorzegt aan kinderen.', a: 'location' },
    { t: 'Ouder dan de Drift, en sindsdien beter bruikbaar dan de meeste rapporten.' },
    { t: 'Men zegt dat %A het nog kent zoals het hoort, met de laatste regel erbij.', a: 'character' },
    { t: 'De kerkeraad heeft dit ooit verboden. Dat maakte het bekender.' },
    { t: 'Er zijn drie lezingen. In alle drie loopt het slecht af voor wie telt.' },
    { t: 'Wie %A heeft gezien, hoort dit verhaal anders.', a: 'abnormality' },
  ],
  session: [
    { t: 'Aanwezig: de gebruikelijke ploeg, met %A als gastrol.', a: 'character' },
    { t: 'Begonnen bij %A, geëindigd ergens waar niemand op gerekend had.', a: 'location' },
    { t: 'Er is gevochten, kort en slecht, en daarna is er onderhandeld.' },
    { t: 'Wat we van %A te horen kregen klopt niet met het rapport van vorige keer.', a: 'character' },
    { t: 'Losse eindjes: de brief, de ton, en of %A nu wel of niet gelogen heeft.', a: 'character' },
    { t: 'De avond leverde %A op, wat niemand had verwacht.', a: ['clue', 'item'] },
  ],
};

/** Openingszinnen, per soort, om de eerste alinea niet altijd hetzelfde te laten beginnen. */
export const OPENINGEN = {
  location: ['Een plek waar men liever overdag komt.', 'De kaart klopt hier niet meer.', 'Niet groot, wel belangrijk geworden.'],
  character: ['Wie hier iets wil, moet geduld hebben.', 'Op het eiland algemeen bekend.', 'Weinig woorden, en die tellen.'],
  investigator: ['Aangesteld in het eerste onderzoek.', 'Doet dit werk erbij, en steeds minder erbij.', 'Eén van de weinigen die aantekeningen bijhoudt.'],
  family: ['Een naam die op het eiland iets betekent.', 'Ouder dan het dorp waar ze wonen.', 'Van de familie is nog een handvol over.'],
  faction: ['Geen vereniging, wel een verband.', 'Bestaat officieel niet in deze vorm.', 'Ouder dan de meeste papieren erover.'],
  object: ['Uit de klei, uit het water, of uit een kelder.', 'Geregistreerd, gefotografeerd, en daarna opgeborgen.', 'Niemand weet waar het vandaan komt.'],
  item: ['Aangetroffen tijdens het onderzoek.', 'In het dossier gebleven.', 'Klein, en daarom bijna gemist.'],
  clue: ['Feitelijk, controleerbaar, en onverklaard.', 'Twee keer nagegaan.', 'Het staat er, en het klopt niet.'],
  abnormality: ['Meermalen waargenomen, nooit verklaard.', 'Volgt een regelmaat die niemand kan benoemen.', 'Begint klein en houdt niet op.'],
  event: ['Wat er die dag gebeurde is grotendeels bekend.', 'De feiten zijn eenvoudig; de volgorde niet.', 'Één avond, en drie versies.'],
  lore: ['Zo vertelt men het op Walcheren.', 'Opgetekend uit de mond van ouderen.', 'Een oud verhaal, met een nieuwe bruikbaarheid.'],
  session: ['Verslag van de avond.', 'Kort verslag, want er is weinig van gekomen.', 'Uitgebreid verslag; het liep anders.'],
};

/** Steekwoorden per soort, waar de bouwer er twee of drie uit trekt. */
export const TAGS = {
  location: ['walcheren', 'kust', 'polder', 'middelburg', 'dijk', 'water'],
  character: ['getuige', 'walcheren', 'haven', 'kerk', 'duits', 'onbetrouwbaar'],
  investigator: ['onderzoeker', 'ploeg', 'eerste-onderzoek'],
  family: ['familie', 'geslacht', 'walcheren', 'bloedlijn', 'erfenis'],
  faction: ['groep', 'smokkel', 'kerk', 'overheid', 'duits'],
  object: ['reliek', 'brons', 'document', 'opgebaggerd'],
  item: ['vondst', 'bewijs', 'dossier'],
  clue: ['meting', 'getuigenis', 'water', 'onverklaard'],
  abnormality: ['onverklaard', 'water', 'folklore', 'nacht'],
  event: ['1934', 'tijdlijn', 'getuigen'],
  lore: ['folklore', 'overlevering', 'kerk', 'vissers'],
  session: ['sessie', 'verslag'],
};
