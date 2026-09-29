'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Cover } from '@/components/Cover';
import { useReportSave, type SaveReport } from '@/components/live/saveRegister';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { slugify } from '@/lib/slug';
import { BORDER_OPTIONS, borderClass } from '@/components/borders';
import { PageBlocksEditor, type TypeLite } from '@/components/admin/PageBlocksEditor';
import { SoortKiezer } from '@/components/admin/SoortKiezer';
import { useNietBewaard } from '@/components/admin/NietBewaard';
import { FIELD_KINDS } from '@/lib/fieldKinds';
// §66/§67: the roles and their Dutch words come from one place, so a role added
// there turns up in this select on its own. `lib/families/roles.ts` is pure —
// no database, no React — which is exactly why a client component may read it.
import { FIELD_ROLES, ROLE_LABELS } from '@/lib/families/roles';
import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_DESCRIPTION_PLACEHOLDER,
  type PageBlock,
  type TypeText,
} from '@/lib/pageBlocks';
import { capitalise, fill, type Words } from '@/lib/words';
import {
  SOORT_ICONEN,
  SOORT_KLEUREN,
  FIELD_KIND_SHORT,
  choicelessFields,
  countTypeChanges,
  fieldHasMore,
  namelessFields,
  othersWithIcon,
  type SoortStaat,
} from '@/lib/beheer';
import { claimNewType, onNewType } from './newType';
import type { FieldDef, FieldKind } from '@/lib/db/schema';
import type { FieldRole } from '@/lib/families/types';
import {
  saveTypeAction,
  deleteTypeAction,
  purgeFieldValuesAction,
  type AdminState,
} from '@/app/(app)/admin/actions';

/**
 * §80: wat het archief van een rij in het veldenlijstje onthoudt zolang dit
 * scherm openstaat. Zie de lange uitleg bij `meta` in `TypeEditor`.
 */
type FieldMeta = { fresh: boolean; keyTouched: boolean; open: boolean };

/**
 * §80: een label wordt een sleutel — en **precies zoals `cleanFields` het
 * doet**, want die is de baas.
 *
 * `cleanFields` neemt de sleutel zoals hij is en vervangt alleen de streepjes
 * door liggende streepjes (`slugify` levert streepjes). Zou dit vakje iets
 * anders voorstellen dan wat er straks opgeslagen wordt, dan zou een Keeper
 * `mijn veld` zien staan en `mijn_veld` krijgen — en dat is precies het soort
 * stil verschil waardoor §79 en §80 hun soorten hebben moeten zaaien.
 */
export function fieldKeyFrom(label: string): string {
  return label.trim() ? slugify(label).replace(/-/g, '_') : '';
}

/**
 * Wat er uit het sleutelvakje zelf mag komen. Hetzelfde alfabet als hierboven,
 * zodat wat je typt ook is wat er opgeslagen wordt — een spatie wordt een
 * liggend streepje, een hoofdletter wordt klein, en de rest valt weg.
 */
/** Verwissel twee plaatsen in een lijst, of laat hem met rust als het niet kan. */
function swap<T>(list: T[], index: number, by: number): T[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function cleanKeyInput(typed: string): string {
  return typed
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
}

/**
 * §11: rename a type, change its icon, colour and card border, add, rename,
 * retype or reorder its fields — and, since the page builder, decide what a
 * fiche of this soort actually *is*: which blocks its page has, in what order,
 * and what the handful of shared sentences say on it.
 *
 * Existing entries keep whatever they had. A field that goes away leaves its
 * value in the JSON, so putting it back brings the value back with it, and the
 * same is true of a hand-filled list: its values are filed under the block's
 * own key, which is assigned once and never changes when the heading does.
 *
 * §107 (golf i3): één scherm in plaats van één kolom van 3.755 px.
 *
 *   - **Twee kolommen op een computer.** Links wat je het vaakst doet: de naam,
 *     het uiterlijk en de velden; rechts wat een soort *is*: het adres, de
 *     gewoontes, de pagina en haar woorden. Op een telefoon onder elkaar, de
 *     velden eerst.
 *   - **Een veld is één rij.** Naam, soort, sleutel, ↑ ↓ en weg. Wat een veld
 *     nog meer vraagt (keuzes, doel-soorten, een rol) staat als één regel
 *     samenvatting eronder en klapt open met een knop — een nieuw veld en een
 *     veld dat net van soort wisselde staan open. Herordenen gaat met knoppen,
 *     niet met slepen (WCAG 2.5.7).
 *   - **Pictogram en kleur** achter één knop die zelf het voorbeeld is, met de
 *     chip en de kaart zoals een lezer ze ziet en een zachte zin als een
 *     andere soort hetzelfde teken draagt (D17).
 *   - **Opslaan blijft een knop**, in een voet die plakt en telt wat er nog
 *     niet bewaard is (Ctrl/⌘ S doet hetzelfde). Geen autosave: `saveType`
 *     schrijft de hele soort in één keer — velden, pagina, woorden — en wat
 *     het schrijft staat meteen op elk artikel van die soort, bij elke
 *     speler. Een half getypte keuzelijst of een veld zonder naam hoort daar
 *     niet tussendoor te landen, een nieuw adres vraagt eerst (§11), en twee
 *     velden met één sleutel houden de knop tegen (§80). Het *woord* over
 *     opslaan staat wel op de ene plek van §100: `useReportSave` meldt zich
 *     bij `SaveStatus` in de schil zolang de editor open is.
 */
export function TypeEditor({
  type,
  types,
  words,
}: {
  type: {
    id: string;
    slug: string;
    label: string;
    icon: string;
    colour: string;
    border: string;
    fields: FieldDef[];
    blocks: PageBlock[];
    pageText: TypeText;
    /** §49: whether a new artikel of this soort starts with the prefix ticked. */
    prefixDefault: boolean;
    /** §80: alleen de Keeper maakt hier artikelen van — en dus: mag het huisraad zijn. */
    keeperMade: boolean;
    /** §80: er is er één van in de wereld (een voorwerp), of niet (huisraad). */
    oneOfAKind: boolean;
    entryCount: number;
    /** §38: values still stored under a key this soort no longer has. */
    orphans: { key: string; count: number }[];
  };
  /** Every soort, so a self-filling list can offer their fields by name. */
  types: TypeLite[];
  words: Words;
}) {
  const ui = useUi();
  const [save, saveAction, saving] = useActionState<AdminState, FormData>(saveTypeAction, {});
  const [remove, removeAction] = useActionState<AdminState, FormData>(deleteTypeAction, {});
  const [label, setLabel] = useState(type.label);
  const [slug, setSlug] = useState(type.slug);
  const [fields, setFields] = useState<FieldDef[]>(type.fields);
  const [blocks, setBlocks] = useState<PageBlock[]>(type.blocks);
  const [pageText, setPageText] = useState<TypeText>(type.pageText);
  const [icon, setIcon] = useState(type.icon);
  const [colour, setColour] = useState(type.colour);
  const [border, setBorder] = useState(type.border);
  const [prefixDefault, setPrefixDefault] = useState(type.prefixDefault);
  const [keeperMade, setKeeperMade] = useState(type.keeperMade);
  const [oneOfAKind, setOneOfAKind] = useState(type.oneOfAKind);
  const [open, setOpen] = useState(false);
  const [looksOpen, setLooksOpen] = useState(false);

  /*
   * §80: welke rij in dit lijstje is *nieuw in deze bewerking*?
   *
   * Dat is de enige vraag die telt voor het sleutelvakje hieronder, en hij is
   * niet te beantwoorden met de sleutel zelf: die wordt getypt en verandert
   * dus onder je handen, en een nieuw veld waarvan iemand de sleutel toevallig
   * op `geboortejaar` zet is nog steeds nieuw. Hij is ook niet te beantwoorden
   * met het veld-object, want `patchField` maakt bij elke aanslag een nieuw
   * object.
   *
   * Dus loopt er één rijtje naast `fields` mee, op index, dat bij de drie
   * plekken die de volgorde veranderen (erbij, omhoog/omlaag, weg) meebeweegt.
   * Een rij die uit de database kwam staat op `fresh: false` en krijgt haar
   * sleutel nooit meer als invulvak te zien — zie de tekst in de UI voor
   * waarom dat geen luiheid is maar de hele reden.
   *
   * `keyTouched` is de tweede helft: zolang niemand de sleutel met de hand
   * heeft aangeraakt, volgt hij het label. Zodra dat wel gebeurt, houdt het
   * archief zijn mond — een sleutel die je zelf hebt ingetypt (`plek`, `prijs`,
   * `effect`) mag niet door de volgende letter in het label overschreven
   * worden.
   *
   * §107: en `open`, of de instellingen van de rij openstaan. Loopt om dezelfde
   * reden op index mee.
   */
  const [meta, setMeta] = useState<FieldMeta[]>(() =>
    type.fields.map(() => ({ fresh: false, keyTouched: false, open: false })),
  );

  /*
   * §107: wat er bij de laatste opslag stond — de nul van de telling in de voet.
   * Na een geslaagde opslag wordt het wat er toen gepost werd, niet wat de
   * server terugstuurt: de editor houdt zijn eigen staat (§11), en de telling
   * gaat over wat déze hand nog niet bewaard heeft.
   */
  const snapshot = (): SoortStaat => ({
    label,
    slug,
    icon,
    colour,
    border,
    prefixDefault,
    keeperMade,
    oneOfAKind,
    fields,
    blocks,
    pageText,
  });
  const [baseline, setBaseline] = useState<SoortStaat>(() => ({
    label: type.label,
    slug: type.slug,
    icon: type.icon,
    colour: type.colour,
    border: type.border,
    prefixDefault: type.prefixDefault,
    keeperMade: type.keeperMade,
    oneOfAKind: type.oneOfAKind,
    fields: type.fields,
    blocks: type.blocks,
    pageText: type.pageText,
  }));
  const posted = useRef<SoortStaat | null>(null);
  useEffect(() => {
    if (save.ok && posted.current) setBaseline(posted.current);
  }, [save]);
  const dirty = countTypeChanges(baseline, snapshot());
  const nameless = namelessFields(fields);
  const choiceless = choicelessFields(fields);

  // §100/§107: het ene opslaan-woord in de schil, zolang deze soort open is.
  const report: SaveReport | null = !open
    ? null
    : saving
      ? 'saving'
      : save.error
        ? 'error'
        : save.ok && !dirty
          ? 'saved'
          : 'idle';
  useReportSave(report, save.error ?? null);
  // §107, golf J: Beheer houdt dit paneel gemount zolang hier iets niet bewaard is.
  useNietBewaard(dirty);

  // §107: wie de pagina verlaat met iets dat niet bewaard is, krijgt de vraag van de browser.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /*
   * §11: a rename of the *address* is not an ordinary save. It moves every
   * artikel of this soort, and it breaks every `/wiki/<oude-slug>` link and
   * every saved filter URL that names it — so the sheet asks first, and only
   * when the address really changed. `confirmed` is what stops the second,
   * programmatic submit from asking all over again.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  /*
   * §96: de soort die je net maakte klapt open, schuift in beeld en zet de
   * focus op *Veld toevoegen* — het eerste wat je met een lege soort doet.
   * Zie `components/admin/newType.ts` voor waarom het id op twee manieren
   * binnenkomt. §107: en die knop typt meteen (zie `typeToAdd`).
   */
  const detailsRef = useRef<HTMLDetailsElement>(null);
  /** Golf J: de volgende `toggle` komt van een tik op de kop, niet van `reveal`. */
  const openedByHand = useRef<false | 'hand' | 'toets'>(false);
  const addFieldRef = useRef<HTMLButtonElement>(null);
  const focusField = useRef<{ index: number; caretAtEnd: boolean } | null>(null);
  useEffect(() => {
    const reveal = () => {
      const details = detailsRef.current;
      if (!details) return;
      details.open = true;
      requestAnimationFrame(() => {
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // The button, not the top of the editor: on a phone the editor is
        // taller than the screen, and the button is what you press next.
        const target = addFieldRef.current ?? details;
        target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        addFieldRef.current?.focus({ preventScroll: true });
      });
    };
    if (claimNewType(type.id)) reveal();
    return onNewType((id) => {
      if (id === type.id && claimNewType(id)) reveal();
    });
  }, [type.id]);

  // §96: a field just added gets the caret in its name, where the typing starts.
  useEffect(() => {
    const want = focusField.current;
    if (want === null) return;
    const box = detailsRef.current?.querySelector<HTMLInputElement>(`[data-field-name="${want.index}"]`);
    if (box) {
      box.focus();
      if (want.caretAtEnd) box.setSelectionRange(box.value.length, box.value.length);
    }
    focusField.current = null;
  });

  const slugChanged = Boolean(slug.trim()) && slugify(slug) !== type.slug;
  // The nudge that fixes Relieken and Voorwerpen: the seed could rename the
  // words but not the addresses, so `object` still sits under "Relieken".
  const suggestion = slugify(label);
  const mismatched = Boolean(label.trim()) && suggestion !== slug;

  async function guardSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      posted.current = snapshot();
      return;
    }
    // The delete button submits this same form with its own action; it has
    // nothing to do with the address.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.hasAttribute('formaction')) return;

    /*
     * §80: twee velden met dezelfde sleutel worden niet opgeslagen maar
     * *half* opgeslagen — `cleanFields` houdt de eerste en laat de tweede
     * vallen. Dat is het ene geval op dit scherm waarin opslaan iets kost wat
     * je dacht te hebben gemaakt, dus is het het ene geval waarin de knop het
     * niet doet. De waarschuwing staat er al; dit is dat hij ook telt.
     */
    if (clashing.size) {
      event.preventDefault();
      ui.toast('Twee velden hebben dezelfde sleutel. Geef er één een andere.');
      return;
    }

    if (!slugChanged) {
      posted.current = snapshot();
      return;
    }

    event.preventDefault();
    const yes = await ui.confirm({
      title: 'Adres van deze soort wijzigen?',
      message: (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            <code>/wiki/{type.slug}</code> wordt <code>/wiki/{slugify(slug)}</code>. Alles in het
            archief verhuist mee: de {words.entryPlural} van deze soort, de velden en de lijsten die
            deze soort noemen.
          </p>
          <p style={{ margin: 0 }}>
            Oude links naar <code>/wiki/{type.slug}</code> en opgeslagen filter-links werken daarna
            niet meer. Die staan buiten het archief, dus die kan het archief niet meeverhuizen.
          </p>
        </>
      ),
      confirmLabel: 'Adres wijzigen',
    });
    if (!yes) return;
    confirmed.current = true;
    formRef.current?.requestSubmit();
  }

  function patchField(index: number, patch: Partial<FieldDef>) {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  function patchMeta(index: number, patch: Partial<FieldMeta>) {
    setMeta((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /**
   * §80: het label van een veld — en, zolang het veld nieuw is en niemand de
   * sleutel heeft aangeraakt, de sleutel eronder.
   *
   * Een leeg label laat de gezaaide `veld_n` staan in plaats van hem leeg te
   * maken: een veld zonder sleutel wordt door `cleanFields` weggegooid, en een
   * half getypte naam mag geen veld kosten.
   */
  function setFieldLabel(index: number, label: string) {
    const follow = meta[index]?.fresh && !meta[index]?.keyTouched;
    const auto = fieldKeyFrom(label);
    patchField(index, follow && auto ? { label, key: auto } : { label });
  }

  function setFieldKey(index: number, typed: string) {
    patchMeta(index, { keyTouched: true });
    patchField(index, { key: cleanKeyInput(typed) });
  }

  /** §107: een andere soort veld die iets vraagt, klapt zijn instellingen open. */
  function setFieldKind(index: number, kind: FieldKind) {
    patchField(index, { kind });
    if (fieldHasMore(kind)) patchMeta(index, { open: true });
  }

  /**
   * §66: "geen rol" is the *absence* of the key, not a `role: ''` — the seed,
   * the server's mirror and `cleanFields` all ask "does this field have a
   * role", so an empty string left behind would read as a fifth answer.
   */
  function setRole(index: number, value: string) {
    setFields((current) =>
      current.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field };
        if (value) next.role = value as FieldRole;
        else delete next.role;
        return next;
      }),
    );
  }

  function move(index: number, by: number) {
    // `meta` loopt op index mee, dus wat hier verwisselt, verwisselt daar ook —
    // anders zou een nieuw veld na één keer omhoog zijn sleutelvakje kwijt zijn.
    setFields((current) => swap(current, index, by));
    setMeta((current) => swap(current, index, by));
  }

  function removeField(index: number) {
    setFields((current) => current.filter((_, i) => i !== index));
    setMeta((current) => current.filter((_, i) => i !== index));
  }

  /** §107: een veld erbij, van de gevraagde soort en eventueel met de eerste letter al getypt. */
  function addField(kind: FieldKind = 'text', typed = '') {
    focusField.current = { index: fields.length, caretAtEnd: Boolean(typed) };
    setFields((current) => [
      ...current,
      {
        key: fieldKeyFrom(typed) || `veld_${current.length + 1}`,
        label: typed,
        kind,
        ...(kind === 'select' || kind === 'multiselect' ? { options: [] } : {}),
      },
    ]);
    setMeta((current) => [...current, { fresh: true, keyTouched: false, open: fieldHasMore(kind) }]);
  }

  /**
   * §107: *Veld toevoegen* typt meteen. Staat de focus op de knop (zoals na
   * *Soort aanmaken*), dan maakt de eerste letter het veld en staat die letter
   * al in zijn naam.
   */
  function typeToAdd(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return;
    event.preventDefault();
    addField('text', event.key);
  }

  /** §107: Enter in de naam van een veld gaat naar het volgende, of maakt er een. */
  function enterInName(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (index + 1 < fields.length) {
      detailsRef.current?.querySelector<HTMLInputElement>(`[data-field-name="${index + 1}"]`)?.focus();
      return;
    }
    if (!fields[index]?.label.trim()) return;
    addField('text');
  }

  /**
   * §80: twee velden met dezelfde sleutel — de fout die stil was.
   *
   * `cleanFields` laat de tweede zonder één woord vallen, dus tot deze ronde
   * kon een Keeper een veld toevoegen, opslaan, en het gewoon niet terugzien.
   * Nu staat het er, bij de rij zelf én boven de knop, en de opslag wacht.
   */
  const clashing = new Set(
    fields
      .map((field) => field.key)
      .filter((key, index, all) => key && all.indexOf(key) !== index),
  );

  const kindLabel = (kind: FieldKind) => FIELD_KINDS.find((option) => option.kind === kind)?.label ?? kind;
  const sharing = othersWithIcon(types, type.slug, icon);
  const takenBy = new Map<string, string[]>();
  for (const other of types) {
    if (other.slug === type.slug || !other.icon) continue;
    takenBy.set(other.icon, [...(takenBy.get(other.icon) ?? []), other.label]);
  }

  return (
    <details
      className="section admin-type"
      ref={detailsRef}
      data-type-id={type.id}
      onToggle={(event) => {
        const details = event.currentTarget as HTMLDetailsElement;
        setOpen(details.open);
        /*
         * §107, golf J: op een telefoon schuift een soort die je met de hand
         * openklapt naar boven, zodat de kop plakt en de velden het scherm
         * krijgen — in plaats van onder de uitleg van het paneel en het vak
         * voor een nieuwe soort te beginnen (rij 27 van de meting: ½ scroll).
         * Alleen met de hand: een nieuwe soort schuift al naar *Veld toevoegen*.
         */
        if (details.open && openedByHand.current && window.matchMedia?.('(max-width: 767px)').matches) {
          // §102: een toetsenbordactie beweegt niet; minder beweging ook niet.
          const still =
            openedByHand.current === 'toets' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          requestAnimationFrame(() => details.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' }));
        }
        openedByHand.current = false;
      }}
    >
      {/*
        Review 4, M11: een soort is een indexrij, zoals de index van Beheer:
        het teken in de soortkleur, de naam in de serif, het getal gedempt en
        een chevron. Open plakt de rij bovenaan, als kop van de editor.
      */}
      <summary
        className="soort-rij"
        onClick={(event) => {
          openedByHand.current = event.detail === 0 ? 'toets' : 'hand';
        }}
      >
        <span className="soort-rij-teken" style={{ ['--soort' as string]: colour } as CSSProperties} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <span className="soort-rij-naam">{type.label}</span>
        <span className="soort-rij-tal">
          {type.entryCount} {type.entryCount === 1 ? words.entry : words.entryPlural}
        </span>
        {dirty > 0 && (
          <span className="soort-kop-dirty" aria-hidden="true" title={fill(words.soortDirty, { n: String(dirty) })} />
        )}
        <Icon name="chevron" size={15} className="soort-rij-pijl" />
      </summary>

      <form
        ref={formRef}
        action={saveAction}
        onSubmit={guardSubmit}
        onKeyDown={(event) => {
          // §107: Ctrl/⌘ S slaat de soort op, zoals overal waar een mens tekst bewaart.
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="soort-form"
      >
        <input type="hidden" name="typeId" value={type.id} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <input type="hidden" name="pageText" value={JSON.stringify(pageText)} />
        <input type="hidden" name="icon" value={icon} />
        <input type="hidden" name="colour" value={colour} />
        <input type="hidden" name="border" value={border} />

        <div className="soort-grid">
          <div className="soort-hoofd">
            <div className="soort-naamrij">
              <span className="soort-naam">
                <label className="label" htmlFor={`label-${type.id}`}>
                  Naam
                </label>
                <input
                  id={`label-${type.id}`}
                  className="input"
                  name="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </span>
              {/* §107: de knop is zelf het voorbeeld — het teken in de kleur, met de naam. */}
              <button
                type="button"
                className="soort-uiterlijk-knop"
                aria-expanded={looksOpen}
                aria-controls={`uiterlijk-${type.id}`}
                data-testid="soort-uiterlijk"
                onClick={() => setLooksOpen((was) => !was)}
                style={{ ['--soort' as string]: colour } as CSSProperties}
              >
                <span className="soort-uiterlijk-teken" aria-hidden="true">
                  <Icon name={icon} size={20} />
                </span>
                <span className="soort-uiterlijk-woord">{words.soortUiterlijk}</span>
                <Icon name="chevron" size={13} className="soort-chevron" />
              </button>
            </div>

            {looksOpen && (
              <Uiterlijk
                id={type.id}
                label={label || type.label}
                icon={icon}
                colour={colour}
                border={border}
                sharing={sharing}
                takenBy={takenBy}
                words={words}
                onIcon={setIcon}
                onColour={setColour}
                onBorder={setBorder}
              />
            )}

            <section className="soort-velden" aria-labelledby={`velden-${type.id}`}>
              <h4 className="label" id={`velden-${type.id}`} style={{ margin: '0 0 0.2rem' }}>
                Velden
              </h4>
              {/*
                §80: de ene zin die dit scherm tot nu toe niet zei.
                `lib/kamers/shape.ts` vraagt een artikel of het een veld met de
                sleutel `plek` draagt — niet van welke soort het is — en dat is met
                opzet: zo mag de Keeper *Boeken*, *Relieken* en *Huisraad* maken en
                passen ze alle drie in een kamer. Alleen was er nergens een vakje
                om die sleutel te zetten, dus moesten §79 en §80 allebei hun soort
                zaaien in een migratie. Dit vakje is die weg.
              */}
              <p className="tiny muted soort-uitleg">
                De <strong>{words.fieldKey.toLowerCase()}</strong> is waaronder het antwoord
                bewaard wordt. Bij een nieuw veld kies je hem zelf (<code>plek</code>,{' '}
                <code>prijs</code>, <code>effect</code> voor een {words.room}); daarna ligt hij vast.
              </p>
              {!fields.length && (
                <p className="tiny muted" style={{ margin: 0 }}>
                  Deze soort heeft geen extra velden. Dat mag.
                </p>
              )}
              <ol className="veld-lijst">
                {fields.map((field, index) => {
                  const more = fieldHasMore(field.kind);
                  const isOpen = Boolean(meta[index]?.open) && more;
                  const detailId = `veld-${type.id}-${index}`;
                  return (
                    <li
                      key={`${index}`}
                      className="veld-rij"
                      data-open={isOpen ? 'ja' : undefined}
                      data-fresh={meta[index]?.fresh ? 'ja' : undefined}
                    >
                      <div className="veld-kop">
                        <input
                          className="input veld-naam"
                          aria-label={`Naam van veld ${index + 1}`}
                          data-field-name={index}
                          value={field.label}
                          onChange={(event) => setFieldLabel(index, event.target.value)}
                          onKeyDown={(event) => enterInName(event, index)}
                        />
                        <select
                          className="select veld-soort"
                          aria-label={`Soort van veld ${index + 1}`}
                          value={field.kind}
                          onChange={(event) => setFieldKind(index, event.target.value as FieldKind)}
                        >
                          {/* Review 4, M11: korte namen, de koppelingen in één groep. */}
                          {FIELD_KINDS.filter((option) => !FIELD_KIND_SHORT[option.kind]).map((option) => (
                            <option key={option.kind} value={option.kind}>
                              {option.label}
                            </option>
                          ))}
                          <optgroup label={words.soortKoppelingNaar}>
                            {FIELD_KINDS.filter((option) => FIELD_KIND_SHORT[option.kind]).map((option) => (
                              <option key={option.kind} value={option.kind}>
                                {FIELD_KIND_SHORT[option.kind]}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {/*
                          §80: de sleutel. Een invulvak zolang het veld in déze
                          bewerking is bijgekomen, en daarna nooit meer — zie de zin
                          boven de lijst, en `meta` voor hoe "nieuw" wordt beslist.
                        */}
                        {meta[index]?.fresh ? (
                          <input
                            className="input veld-sleutel"
                            data-testid="veld-sleutel"
                            data-field-index={index}
                            aria-label={`${words.fieldKey} van veld ${index + 1}`}
                            placeholder={words.fieldKey}
                            value={field.key}
                            spellCheck={false}
                            autoCapitalize="none"
                            onChange={(event) => setFieldKey(index, event.target.value)}
                          />
                        ) : (
                          <code
                            className="tiny muted veld-sleutel"
                            data-testid="veld-sleutel-vast"
                            data-field-key={field.key}
                            title={`${words.fieldKey}: ${field.key} — ligt vast`}
                          >
                            {field.key}
                          </code>
                        )}
                        <span className="veld-knoppen">
                          <button
                            type="button"
                            className="btn btn-small btn-ghost veld-knop"
                            aria-label={`Veld ${index + 1} omhoog`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-ghost veld-knop"
                            aria-label={`Veld ${index + 1} omlaag`}
                            disabled={index === fields.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-ghost veld-knop"
                            aria-label={`Veld ${index + 1} verwijderen`}
                            onClick={() => removeField(index)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </span>
                      </div>

                      {more && (
                        <button
                          type="button"
                          className="veld-samenvatting"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          onClick={() => patchMeta(index, { open: !isOpen })}
                        >
                          <Icon name="chevron" size={12} className="soort-chevron" />
                          <span className="visually-hidden">
                            {words.soortVeldMeer} ({kindLabel(field.kind)}):{' '}
                          </span>
                          <span className="veld-samenvatting-tekst">
                            {isOpen ? words.soortVeldMeer : fieldSummary(field, types, words)}
                          </span>
                        </button>
                      )}

                      {isOpen && (
                        <div className="veld-meer" id={detailId}>
                          {/* §38: a Meerkeuze is a Keuzelijst that takes more than one
                              answer, so it is configured with the same box. */}
                          {(field.kind === 'select' || field.kind === 'multiselect') && (
                            <input
                              className="input"
                              aria-label={`Keuzes van veld ${index + 1}`}
                              placeholder="keuzes, met komma's"
                              value={(field.options ?? []).join(', ')}
                              onChange={(event) =>
                                patchField(index, {
                                  options: event.target.value.split(',').map((option) => option.trim()),
                                })
                              }
                            />
                          )}
                          {/* §51: a koppelingsveld may be aimed at a handful of soorten
                              at once — "Leden" takes personen, onderzoekers én
                              abnormaliteiten. */}
                          {(field.kind === 'entry_link' || field.kind === 'entry_links') && (
                            <>
                              <SoortKiezer
                                types={types}
                                chosen={field.ofType ?? []}
                                words={words}
                                lead={words.soortDoelAlleen}
                                testId="veld-soorten"
                                onChange={(ofType) => patchField(index, { ofType })}
                              />
                              {/* §66: en wát dit veld betekent in een stamboom. Leeg is het
                                  normale geval — een koppelingsveld is meestal geen
                                  verwantschap. Staat er wel een rol in, dan tekent elke
                                  stamboom de lijn en schrijft de server de andere kant erbij. */}
                              <div className="veld-rol">
                                <select
                                  className="select"
                                  aria-label={`Rol in een stamboom van veld ${index + 1}`}
                                  value={field.role ?? ''}
                                  onChange={(event) => setRole(index, event.target.value)}
                                >
                                  <option value="">Rol in een stamboom: —</option>
                                  {FIELD_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                      Rol in een stamboom: {ROLE_LABELS[role]}
                                    </option>
                                  ))}
                                </select>
                                <span className="tiny muted">
                                  Met een rol tekent elke stamboom deze lijn en vult het archief de
                                  andere kant zelf in. Verwant wordt getekend en niet gespiegeld.
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* §80: dezelfde sleutel als een ander veld. `cleanFields`
                          houdt de eerste en laat deze vallen — stil, tot nu. */}
                      {Boolean(field.key) && clashing.has(field.key) && (
                        <span
                          className="error-note tiny"
                          data-testid="veld-sleutel-botsing"
                          data-field-key={field.key}
                          style={{ margin: 0 }}
                        >
                          Er is al een veld met de {words.fieldKey.toLowerCase()} <code>{field.key}</code>
                          . Zo opslaan bewaart alleen het bovenste van de twee.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="veld-toevoegen">
                <button
                  ref={addFieldRef}
                  type="button"
                  className="btn btn-small veld-toevoegen-knop"
                  aria-describedby={`veld-typt-${type.id}`}
                  onClick={() => addField('text')}
                  onKeyDown={typeToAdd}
                >
                  <Icon name="plus" size={15} />
                  Veld toevoegen
                </button>
                <span className="tiny muted">{words.soortSnel}</span>
                {QUICK_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="btn btn-small btn-ghost veld-snel"
                    onClick={() => addField(kind)}
                  >
                    <Icon name="plus" size={13} />
                    {(QUICK_LABEL_KEY[kind] && words[QUICK_LABEL_KEY[kind]!]) || kindLabel(kind)}
                  </button>
                ))}
                <span className="tiny muted veld-typt" id={`veld-typt-${type.id}`}>
                  {words.soortVeldTypt}
                </span>
              </div>
            </section>
          </div>

          <div className="soort-zij">
            {/* §11: the address, and the line under it is the URL it actually makes. */}
            <div>
              <label className="label" htmlFor={`slug-${type.id}`}>
                Adres (slug)
              </label>
              <input
                id={`slug-${type.id}`}
                className="input"
                name="slug"
                value={slug}
                spellCheck={false}
                autoCapitalize="none"
                onChange={(event) => setSlug(event.target.value)}
              />
              {/*
                §11: plain Dutch, beside the box, and always — not only once the
                address has been touched. Somebody about to rename a soort should read
                what it costs before they type, not after.
              */}
              <span className="tiny muted" style={{ display: 'block', marginTop: '0.2rem' }}>
                /wiki/{slug.trim() ? slugify(slug) : '…'} · verander je dit, dan verhuist het archief
                mee, maar oude links van buiten werken niet meer.
              </span>
              {/*
                The nudge, not the fix: `Relieken` still lives at `object` and
                `Voorwerpen` at `item`, because the seed could rename the words
                and not the addresses. Nothing is renamed on its own — moving
                every artikel of a soort and breaking every old link is a thing a
                person decides. This only says so, and fills in the answer.
              */}
              {mismatched && (
                <span className="tiny" style={{ display: 'block', marginTop: '0.3rem' }}>
                  Het adres (<code>{slug}</code>) hoort niet meer bij de naam ({label.trim()}).{' '}
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => setSlug(suggestion)}
                  >
                    <Icon name="edit" size={13} />
                    {suggestion} gebruiken
                  </button>
                </span>
              )}
            </div>

            {/*
              §49: this used to say *where* a soort could be made ("alleen in een
              dossier"), which was two rules in one tick. What is left is the habit:
              what the tickbox in the "nieuw artikel"-venster starts on.
            */}
            <div>
              <span className="label">Naam in de wiki</span>
              <input type="hidden" name="prefixDefault" value={prefixDefault ? '1' : ''} />
              <button
                type="button"
                aria-pressed={prefixDefault}
                className={`chip chip-selectable${prefixDefault ? ' chip-active' : ''}`}
                onClick={() => setPrefixDefault((was) => !was)}
              >
                <Icon name={prefixDefault ? 'folder' : 'file'} size={13} />
                {prefixDefault
                  ? `Standaard het ${words.case} voor de naam`
                  : `Standaard geen ${words.case} voor de naam`}
              </button>
              <span className="tiny muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                {prefixDefault
                  ? `In een ${words.case} gemaakt heten ze "${capitalise(words.case)}: naam". Elk artikel kan dat zelf uitzetten.`
                  : `In een ${words.case} gemaakt heten ze gewoon hoe ze heten. Elk artikel kan het ${words.case} zelf voor zijn naam zetten.`}
              </span>
            </div>

            {/*
              §80: de twee vinkjes die van een soort huisraad maken.
              Ze staan bij elkaar omdat ze samen één vraag zijn — *van wie is dit
              ding en hoeveel zijn er van*. Waarom ze wél patchbaar zijn waar
              `caseOnly` dat niet is, staat in `TypePatch` in `lib/admin/types.ts`.
            */}
            <div>
              <span className="label">Wat voor soort dit is</span>
              <label className="soort-vinkje">
                <input
                  type="checkbox"
                  name="keeperMade"
                  value="1"
                  data-testid="soort-keeper-made"
                  checked={keeperMade}
                  onChange={(event) => setKeeperMade(event.target.checked)}
                />
                <span>
                  <span className="small">{words.typeKeeperMade}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Een speler kan er geen maken. Alleen zo’n soort komt in de{' '}
                    {words.catalogue.toLowerCase()} van een {words.room}.
                  </span>
                </span>
              </label>
              <label className="soort-vinkje">
                <input
                  type="checkbox"
                  name="oneOfAKind"
                  value="1"
                  data-testid="soort-one-of-a-kind"
                  checked={oneOfAKind}
                  onChange={(event) => setOneOfAKind(event.target.checked)}
                />
                <span>
                  <span className="small">{words.typeOneOfAKind}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Ligt hij in de {words.room} van de één, dan kan hij nergens anders liggen. Uit
                    voor {words.furnishingPlural} waarvan er meer zijn.
                  </span>
                </span>
              </label>
            </div>

            <PageBlocksEditor
              blocks={blocks}
              onChange={setBlocks}
              types={types}
              words={words}
              idPrefix={`blk-${type.id}`}
            />

            <div>
              <span className="label">De woorden van deze soort</span>
              <p className="tiny muted" style={{ margin: '0 0 0.45rem' }}>
                Een locatie vraagt iets anders dan een persoon. Laat leeg voor de vraag die overal
                staat.
              </p>
              <div className="stack" style={{ gap: '0.45rem' }}>
                <span>
                  <label className="tiny muted" htmlFor={`txt-desc-${type.id}`}>
                    De vraag onder de titel
                  </label>
                  <textarea
                    id={`txt-desc-${type.id}`}
                    className="textarea"
                    rows={2}
                    value={pageText.descriptionPlaceholder ?? ''}
                    placeholder={DEFAULT_DESCRIPTION_PLACEHOLDER}
                    onChange={(event) =>
                      setPageText((current) => ({
                        ...current,
                        descriptionPlaceholder: event.target.value,
                      }))
                    }
                  />
                </span>
                <span>
                  <label className="tiny muted" htmlFor={`txt-body-${type.id}`}>
                    De regel in het grote tekstvak
                  </label>
                  <input
                    id={`txt-body-${type.id}`}
                    className="input"
                    value={pageText.bodyPlaceholder ?? ''}
                    placeholder={DEFAULT_BODY_PLACEHOLDER}
                    onChange={(event) =>
                      setPageText((current) => ({ ...current, bodyPlaceholder: event.target.value }))
                    }
                  />
                </span>
                <span>
                  <label className="tiny muted" htmlFor={`txt-new-${type.id}`}>
                    Wat de knop ‘nieuw’ zegt
                  </label>
                  <input
                    id={`txt-new-${type.id}`}
                    className="input"
                    value={pageText.newButton ?? ''}
                    placeholder={words.newOfType ?? 'Nieuw'}
                    onChange={(event) =>
                      setPageText((current) => ({ ...current, newButton: event.target.value }))
                    }
                  />
                </span>
                <span>
                  <label className="tiny muted" htmlFor={`txt-noback-${type.id}`}>
                    Wat er staat als niets hiernaar verwijst
                  </label>
                  <input
                    id={`txt-noback-${type.id}`}
                    className="input"
                    value={pageText.noBacklinks ?? ''}
                    placeholder="Nog niets verwijst hiernaar."
                    onChange={(event) =>
                      setPageText((current) => ({ ...current, noBacklinks: event.target.value }))
                    }
                  />
                </span>
              </div>
            </div>

            {type.entryCount === 0 && (
              <button className="btn btn-small btn-danger soort-weg" type="submit" formAction={removeAction}>
                <Icon name="trash" size={14} />
                Soort verwijderen
              </button>
            )}
            {remove.error && <p className="error-note">{remove.error}</p>}
          </div>
        </div>

        {/* §80: en nog een keer, vlak boven de knop, want daar wordt gekeken. */}
        {clashing.size > 0 && (
          <p className="error-note" data-testid="soort-sleutel-botsing">
            Twee velden hebben dezelfde {words.fieldKey.toLowerCase()} (
            {[...clashing].map((key) => (
              <code key={key} style={{ marginRight: '0.3rem' }}>
                {key}
              </code>
            ))}
            ). Zo opslaan bewaart er maar één van elk paar. Geef er één een andere{' '}
            {words.fieldKey.toLowerCase()}.
          </p>
        )}

        {/*
          §96: de voet plakt onderaan in beeld zolang deze editor open en
          langer dan het scherm is. §107: en hij telt wat er nog niet bewaard
          is, zegt het als een veld zonder naam zal wegvallen, en heeft een
          deur naar een nieuw artikel van deze soort.
        */}
        {/*
          Review 4, M11: één taal voor de plakkende voeten van Soorten en
          Woorden — de telling links (rood als er iets openstaat), Opslaan
          rechts, en hier *Nieuw artikel* als tweede knop ernaast.
        */}
        <div className="admin-sticky-foot admin-type-foot beheer-voet soort-voet" data-testid="soort-voet">
          <span className="small beheer-voet-telling soort-voet-telling" aria-live="polite" data-dirty={dirty}>
            {dirty > 0 ? (
              <strong>{fill(words.soortDirty, { n: String(dirty) })}</strong>
            ) : (
              <span className="muted">{words.soortSchoon}</span>
            )}
            {nameless > 0 && (
              <span className="muted"> · {fill(words.soortZonderNaam, { n: String(nameless) })}</span>
            )}
            {/* Review 4, L5: een keuzelijst zonder keuzes wordt niet stil opgeslagen. */}
            {choiceless.length > 0 && (
              <span className="muted" data-testid="soort-geen-keuzes">
                {' '}
                · {fill(words.soortGeenKeuzes, { veld: choiceless.join(', ') })}
              </span>
            )}
            {save.error && <span className="error-note"> {save.error}</span>}
          </span>
          <span className="tiny muted soort-sneltoets">{words.soortSneltoets}</span>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            data-testid="soort-nieuw-artikel"
            onClick={() => ui.openNewEntry({ typeSlug: type.slug })}
          >
            <Icon name="plus" size={14} />
            {fill(words.soortNieuwArtikel, { artikel: words.entry })}
          </button>
          <button className="btn btn-small btn-primary" type="submit" disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </form>

      {/*
        §38: outside the form above, because it is a form of its own and one
        form may not sit inside another. It is also the only place in the whole
        archive that deletes an infobox value.
      */}
      <OldValues typeId={type.id} orphans={type.orphans} words={words} />
    </details>
  );
}

/** §107: de soorten die *Veld toevoegen* meteen aanbiedt, naast gewone tekst. */
const QUICK_KINDS: FieldKind[] = ['select', 'entry_links', 'number', 'date'];
/** Golf J: de naam van een snelknop, als die anders is dan de lange naam van de soort veld (§11: uit `lib/words.ts`). */
const QUICK_LABEL_KEY: Partial<Record<FieldKind, string>> = { entry_links: 'soortSnelKoppelingen' };

/** §107: één regel over wat een veld nog meer heeft ingesteld, voor de ingeklapte rij. */
function fieldSummary(field: FieldDef, types: TypeLite[], words: Words): string {
  if (field.kind === 'select' || field.kind === 'multiselect') {
    const options = (field.options ?? []).filter(Boolean);
    return options.length ? options.join(', ') : words.soortNogGeenKeuzes;
  }
  const names = types.filter((option) => (field.ofType ?? []).includes(option.slug)).map((option) => option.label);
  const target = names.length ? `→ ${names.join(', ')}` : `→ ${words.typeTargetsAll}`;
  // De rol eerst: een lange rij soorten wordt afgekapt, de rol mag dat niet.
  return field.role ? `${ROLE_LABELS[field.role]} · ${target}` : target;
}

/**
 * §107: pictogram, kleur en rand van een soort, met het voorbeeld ernaast.
 *
 * Het voorbeeld is geen plaatje maar de echte klassen: `.chip-soort` zoals
 * een soort in een lijst staat, en `.card` met de rand zoals een kaart van
 * deze soort in zijn eigen lijst staat. Draagt een andere soort hetzelfde
 * pictogram, dan zegt één zachte zin wie (D17) — geen weigering.
 */
function Uiterlijk({
  id,
  label,
  icon,
  colour,
  border,
  sharing,
  takenBy,
  words,
  onIcon,
  onColour,
  onBorder,
}: {
  id: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  sharing: string[];
  /** Welke pictogrammen andere soorten al dragen, en welke soorten dat zijn. */
  takenBy: Map<string, string[]>;
  words: Words;
  onIcon: (name: string) => void;
  onColour: (value: string) => void;
  onBorder: (value: string) => void;
}) {
  const soort = { ['--soort' as string]: colour } as CSSProperties;
  const listed = SOORT_ICONEN.some((option) => option.name === icon);
  const icons = listed ? SOORT_ICONEN : [{ name: icon, label: icon }, ...SOORT_ICONEN];
  const inRow = SOORT_KLEUREN.some((swatch) => swatch.toLowerCase() === colour.toLowerCase());
  return (
    <div className="soort-uiterlijk" id={`uiterlijk-${id}`} data-testid="soort-uiterlijk-paneel">
      <div className="soort-uiterlijk-kiezers">
        <fieldset className="soort-fieldset">
          <legend className="label">{words.soortPictogram}</legend>
          <div className="soort-iconen" role="radiogroup" aria-label={words.soortPictogram}>
            {icons.map((option) => {
              const taken = option.name !== icon ? takenBy.get(option.name) : undefined;
              return (
                <button
                  key={option.name}
                  type="button"
                  role="radio"
                  aria-checked={icon === option.name}
                  aria-label={option.label}
                  title={taken ? `${option.label} · ${taken.join(', ')}` : option.label}
                  className="soort-icoon"
                  data-taken={taken ? 'ja' : undefined}
                  style={soort}
                  onClick={() => onIcon(option.name)}
                >
                  <Icon name={option.name} size={18} />
                </button>
              );
            })}
          </div>
          {sharing.length > 0 && (
            <p className="tiny soort-teken-ook" data-testid="soort-teken-ook" role="status">
              <Icon name="info" size={13} />
              {fill(sharing.length > 1 ? words.soortTekenOokMeer : words.soortTekenOok, {
                soorten: sharing.join(', '),
              })}
            </p>
          )}
        </fieldset>

        <fieldset className="soort-fieldset">
          <legend className="label">{words.soortKleur}</legend>
          <div className="soort-kleuren" role="radiogroup" aria-label={words.soortKleur}>
            {SOORT_KLEUREN.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={swatch.toLowerCase() === colour.toLowerCase()}
                aria-label={swatch}
                className="soort-staal"
                style={{ background: swatch }}
                onClick={() => onColour(swatch)}
              />
            ))}
            <label className={`soort-eigen${inRow ? '' : ' soort-eigen-aan'}`}>
              <input
                id={`colour-${id}`}
                type="color"
                value={colour}
                onChange={(event) => onColour(event.target.value)}
              />
              <span className="tiny">{words.soortEigenKleur}</span>
            </label>
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor={`border-${id}`}>
            Rand van de kaart
          </label>
          <select
            id={`border-${id}`}
            className="select"
            value={border}
            onChange={(event) => onBorder(event.target.value)}
          >
            {BORDER_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="soort-voorbeeld" aria-label={words.soortVoorbeeld} role="img">
        <span className="label">{words.soortVoorbeeld}</span>
        <span className="chip chip-soort" style={soort}>
          <Icon name={icon} size={12} />
          {label}
        </span>
        <div className={`card ${borderClass(border)} soort-voorbeeld-kaart`} style={soort}>
          <Cover assetId={null} shape="portrait" alt="" icon={icon} colour={colour} />
          <div className="card-body">
            <p className="card-name">{fill(words.soortVoorbeeldNaam, { artikel: words.entry })}</p>
            <p className="tiny muted card-meta">
              <Icon name={icon} size={13} className="soort-inkt" />
              <span className="card-meta-soort">{label}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * §96 (C32) en §107: de doel-soorten van een koppelveld staan achter één kiezer —
 * `SoortKiezer` (components/admin/SoortKiezer.tsx), sinds golf J dezelfde als
 * die van de pagina (`PageBlocksEditor`).
 */

/**
 * §38: "Oude waarden" — what is still stored under a key this soort no longer
 * has, and the one button that throws it away.
 *
 * Taking a field away has never destroyed anything: the value stays in the
 * JSON, and putting the field back brings it with it. That is the right
 * default, and it is also invisible, so a Keeper who renamed a field twice has
 * no idea the archive is still carrying the first two. This counts it, per key,
 * read-only — and offers the escape hatch, which asks first, because unlike
 * everything else on this page it cannot be undone.
 */
function OldValues({
  typeId,
  orphans,
  words,
}: {
  typeId: string;
  orphans: { key: string; count: number }[];
  words: Words;
}) {
  const ui = useUi();
  const [state, action, busy] = useActionState<AdminState, FormData>(purgeFieldValuesAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [wiping, setWiping] = useState('');

  if (!orphans.length) return state.ok ? <p className="small muted">{state.ok}</p> : null;

  async function guard(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    event.preventDefault();
    const key = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? '';
    const found = orphans.find((orphan) => orphan.key === key);
    const yes = await ui.confirm({
      title: `‘${key}’ definitief wissen?`,
      message: (
        <p style={{ margin: 0 }}>
          Deze waarde staat nog bij {found?.count ?? 0}{' '}
          {found?.count === 1 ? words.entry : words.entryPlural}. Zet je het veld terug, dan komt de
          waarde nu nog mee. Na dit wissen niet meer — dit kan niet ongedaan worden gemaakt.
        </p>
      ),
      confirmLabel: 'Definitief wissen',
      danger: true,
    });
    if (!yes) return;
    confirmed.current = true;
    setWiping(key);
    formRef.current?.requestSubmit(
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement,
    );
  }

  return (
    <form ref={formRef} action={action} onSubmit={guard} style={{ padding: '0 0 1rem' }}>
      <input type="hidden" name="typeId" value={typeId} />
      <span className="label">Oude waarden</span>
      <p className="tiny muted" style={{ margin: '0 0 0.45rem', maxWidth: '46rem' }}>
        Deze waarden staan nog in het archief onder een veld dat deze soort niet meer heeft. Ze
        worden nergens getoond, en zet je het veld terug, dan komen ze weer mee.
      </p>
      <ul className="stack" style={{ gap: '0.3rem', listStyle: 'none', margin: 0, padding: 0 }}>
        {orphans.map((orphan) => (
          <li key={orphan.key} className="row-wrap" style={{ gap: '0.4rem', alignItems: 'center' }}>
            <code style={{ flex: '0 1 auto' }}>{orphan.key}</code>
            <span className="tiny muted" style={{ flex: '1 1 6rem' }}>
              {orphan.count} {orphan.count === 1 ? words.entry : words.entryPlural}
            </span>
            <button
              className="btn btn-small btn-danger"
              type="submit"
              name="fieldKey"
              value={orphan.key}
              disabled={busy}
            >
              <Icon name="trash" size={13} />
              {busy && wiping === orphan.key ? 'Wissen…' : 'Definitief wissen'}
            </button>
          </li>
        ))}
      </ul>
      {state.error && <p className="error-note">{state.error}</p>}
      {state.ok && <p className="small muted">{state.ok}</p>}
    </form>
  );
}
