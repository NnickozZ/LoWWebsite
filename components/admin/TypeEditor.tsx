'use client';

import { useActionState, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { slugify } from '@/lib/slug';
import { BORDER_OPTIONS } from '@/components/borders';
import { PageBlocksEditor, type TypeLite } from '@/components/admin/PageBlocksEditor';
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
import { capitalise, type Words } from '@/lib/words';
import type { FieldDef, FieldKind } from '@/lib/db/schema';
import type { FieldRole } from '@/lib/families/types';
import {
  saveTypeAction,
  deleteTypeAction,
  purgeFieldValuesAction,
  type AdminState,
} from '@/app/(app)/admin/actions';

const ICONS = [
  'person',
  'badge',
  'pin',
  'box',
  'magnifier',
  'eye',
  'flag',
  'calendar',
  'book',
  'notebook',
  'file',
  'folder',
  'board',
  'clock',
  'shield',
  'lock',
];

/**
 * §80: wat het archief van een rij in het veldenlijstje onthoudt zolang dit
 * scherm openstaat. Zie de lange uitleg bij `meta` in `TypeEditor`.
 */
type FieldMeta = { fresh: boolean; keyTouched: boolean };

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
  const [prefixDefault, setPrefixDefault] = useState(type.prefixDefault);
  const [keeperMade, setKeeperMade] = useState(type.keeperMade);
  const [oneOfAKind, setOneOfAKind] = useState(type.oneOfAKind);

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
   */
  const [meta, setMeta] = useState<FieldMeta[]>(() =>
    type.fields.map(() => ({ fresh: false, keyTouched: false })),
  );

  /*
   * §11: a rename of the *address* is not an ordinary save. It moves every
   * artikel of this soort, and it breaks every `/wiki/<oude-slug>` link and
   * every saved filter URL that names it — so the sheet asks first, and only
   * when the address really changed. `confirmed` is what stops the second,
   * programmatic submit from asking all over again.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const slugChanged = Boolean(slug.trim()) && slugify(slug) !== type.slug;
  // The nudge that fixes Relieken and Voorwerpen: the seed could rename the
  // words but not the addresses, so `object` still sits under "Relieken".
  const suggestion = slugify(label);
  const mismatched = Boolean(label.trim()) && suggestion !== slug;

  async function guardSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
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

    if (!slugChanged) return;

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
    setMeta((current) => current.map((row, i) => (i === index ? { ...row, keyTouched: true } : row)));
    patchField(index, { key: cleanKeyInput(typed) });
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

  function addField() {
    setFields((current) => [
      ...current,
      { key: `veld_${current.length + 1}`, label: '', kind: 'text' },
    ]);
    setMeta((current) => [...current, { fresh: true, keyTouched: false }]);
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

  return (
    <details className="section admin-type">
      <summary>
        <Icon name={icon} size={15} style={{ color: colour }} />
        {type.label}
        <span className="muted tiny" style={{ marginLeft: '0.4rem' }}>
          {type.entryCount} {type.entryCount === 1 ? 'artikel' : 'artikelen'}
        </span>
      </summary>

      <form
        ref={formRef}
        action={saveAction}
        onSubmit={guardSubmit}
        className="stack"
        style={{ padding: '0.7rem 0 1rem' }}
      >
        <input type="hidden" name="typeId" value={type.id} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <input type="hidden" name="pageText" value={JSON.stringify(pageText)} />

        <div className="row-wrap">
          <span style={{ flex: '1 1 12rem' }}>
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
          {/* §11: the address, beside the name, because they are one thing said
              twice — and the line under it is the URL it actually makes. */}
          <span style={{ flex: '1 1 12rem' }}>
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
            <span className="tiny muted" style={{ display: 'block', marginTop: '0.2rem' }}>
              /wiki/{slug.trim() ? slugify(slug) : '…'}
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
                Het adres van deze soort (<code>{slug}</code>) hoort niet meer bij de naam (
                {label.trim()}).{' '}
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
          </span>
          <span>
            <label className="label" htmlFor={`colour-${type.id}`}>
              Kleur
            </label>
            <input
              id={`colour-${type.id}`}
              className="input"
              name="colour"
              type="color"
              value={colour}
              onChange={(event) => setColour(event.target.value)}
              style={{ width: 72, padding: '0.2rem' }}
            />
          </span>
          <span style={{ flex: '1 1 10rem' }}>
            <label className="label" htmlFor={`border-${type.id}`}>
              Rand van de kaart
            </label>
            <select
              id={`border-${type.id}`}
              className="select"
              name="border"
              defaultValue={type.border}
            >
              {BORDER_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        {/*
          §49: this used to say *where* a soort could be made ("alleen in een
          dossier"), which was two rules in one tick: a gate on the maker, and a
          dossier printed in front of every name. The gate is gone — every soort
          is makeable everywhere again — and what is left is the habit: what the
          tickbox in the "nieuw artikel"-venster starts on. Each artikel decides
          for itself afterwards, on its own page, so changing this never touches
          anything that already exists.
        */}
        <div>
          <span className="label">Naam in de wiki</span>
          <input type="hidden" name="prefixDefault" value={prefixDefault ? '1' : ''} />
          <div className="row-wrap">
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
            <span className="tiny muted" style={{ flex: '1 1 14rem' }}>
              {prefixDefault
                ? `Maak je er een in een ${words.case}, dan staat het vinkje "${capitalise(words.case)} voor de naam" al aan: in de wiki komen ze te staan als "${capitalise(words.case)}: naam". Elk artikel kan dat op zijn eigen pagina aan- en uitzetten.`
                : `Maak je er een in een ${words.case}, dan staat het vinkje "${capitalise(words.case)} voor de naam" uit: in de wiki heten ze gewoon hoe ze heten. Elk artikel kan dat op zijn eigen pagina alsnog aanzetten.`}
            </span>
          </div>
        </div>

        {/*
          §80: de twee vinkjes die van een soort huisraad maken.
          Ze staan bij elkaar omdat ze samen één vraag zijn — *van wie is dit
          ding en hoeveel zijn er van* — en ze staan hier, bij de andere
          gewoontes van een soort, omdat het geen opmaak is maar een regel.
          Waarom ze wél patchbaar zijn waar `caseOnly` dat niet is, staat in
          `TypePatch` in `lib/admin/types.ts`.
        */}
        <div>
          <span className="label">Wat voor soort dit is</span>
          <div className="stack" style={{ gap: '0.35rem' }}>
            <label className="row-wrap" style={{ gap: '0.45rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                name="keeperMade"
                value="1"
                data-testid="soort-keeper-made"
                checked={keeperMade}
                onChange={(event) => setKeeperMade(event.target.checked)}
              />
              <span className="small">{words.typeKeeperMade}</span>
            </label>
            <p className="tiny muted" style={{ margin: '0 0 0.2rem 1.5rem', maxWidth: '44rem' }}>
              Een speler kan er geen maken, en het staat niet in zijn lijstje ‘nieuw’. Alleen zo’n
              soort komt in de {words.catalogue.toLowerCase()} van een {words.room} terecht.
            </p>
            <label className="row-wrap" style={{ gap: '0.45rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                name="oneOfAKind"
                value="1"
                data-testid="soort-one-of-a-kind"
                checked={oneOfAKind}
                onChange={(event) => setOneOfAKind(event.target.checked)}
              />
              <span className="small">{words.typeOneOfAKind}</span>
            </label>
            <p className="tiny muted" style={{ margin: '0 0 0 1.5rem', maxWidth: '44rem' }}>
              Er is er één van in de wereld: ligt hij in de {words.room} van de één, dan kan hij
              nergens anders liggen. Laat dit uit voor {words.furnishingPlural} waarvan er meer
              zijn — twee onderzoekers mogen dezelfde lamp hebben.
            </p>
          </div>
        </div>

        <div>
          <span className="label">Pictogram</span>
          <input type="hidden" name="icon" value={icon} />
          <div className="row-wrap">
            {ICONS.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={icon === name}
                className={`chip chip-selectable${icon === name ? ' chip-active' : ''}`}
                onClick={() => setIcon(name)}
              >
                <Icon name={name} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Velden</span>
          {/*
            §80: de ene zin die dit scherm tot nu toe niet zei.
            `lib/kamers/shape.ts` vraagt een artikel of het een veld met de
            sleutel `plek` draagt — niet van welke soort het is — en dat is met
            opzet: zo mag de Keeper *Boeken*, *Relieken* en *Huisraad* maken en
            passen ze alle drie in een kamer. Alleen was er nergens een vakje
            om die sleutel te zetten, dus moesten §79 en §80 allebei hun soort
            zaaien in een migratie. Dit vakje is die weg.
          */}
          <p className="tiny muted" style={{ margin: '0 0 0.45rem', maxWidth: '46rem' }}>
            De <strong>{words.fieldKey.toLowerCase()}</strong> is de naam waaronder het antwoord in
            het archief staat. Bij een <em>nieuw</em> veld kies je hem zelf — zo maak je een soort
            die in een {words.room} past (<code>plek</code>, <code>prijs</code>,{' '}
            <code>effect</code>). Bij een veld dat er al is staat hij vast en kun je hem niet meer
            wijzigen: elk antwoord dat er al onder staat zou zijn veld kwijtraken.
          </p>
          {!fields.length && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Deze soort heeft geen extra velden. Dat mag.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {fields.map((field, index) => (
              <li key={`${field.key}-${index}`} className="admin-field-row">
                <input
                  className="input"
                  aria-label={`Naam van veld ${index + 1}`}
                  value={field.label}
                  onChange={(event) => setFieldLabel(index, event.target.value)}
                  style={{ flex: '1 1 8rem', minHeight: 38 }}
                />
                {/*
                  §80: de sleutel. Een invulvak zolang het veld in déze
                  bewerking is bijgekomen, en daarna nooit meer — zie de zin
                  boven de lijst, en `meta` voor hoe "nieuw" wordt beslist.
                */}
                {meta[index]?.fresh ? (
                  <input
                    className="input"
                    data-testid="veld-sleutel"
                    data-field-index={index}
                    aria-label={`${words.fieldKey} van veld ${index + 1}`}
                    placeholder={words.fieldKey}
                    value={field.key}
                    spellCheck={false}
                    autoCapitalize="none"
                    onChange={(event) => setFieldKey(index, event.target.value)}
                    style={{ flex: '0 1 9rem', minHeight: 38, fontFamily: 'var(--mono, monospace)' }}
                  />
                ) : (
                  <code
                    className="tiny muted"
                    data-testid="veld-sleutel-vast"
                    data-field-key={field.key}
                    title={`${words.fieldKey}: ${field.key} — ligt vast`}
                    style={{ flex: '0 1 9rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {field.key}
                  </code>
                )}
                <select
                  className="select"
                  aria-label={`Soort van veld ${index + 1}`}
                  value={field.kind}
                  onChange={(event) =>
                    patchField(index, { kind: event.target.value as FieldKind })
                  }
                  style={{ flex: '0 1 12rem', minHeight: 38 }}
                >
                  {FIELD_KINDS.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                    style={{ flex: '1 1 8rem', minHeight: 38 }}
                  />
                )}
                {/* §51: a koppelingsveld may be aimed at a handful of soorten
                    at once — "Leden" takes personen, onderzoekers én
                    abnormaliteiten. Same control as the page builder's list
                    block, because it is the same question. */}
                {/* §66: en wát dit veld betekent in een stamboom. Leeg is het
                    normale geval — een koppelingsveld is meestal geen
                    verwantschap. Staat er wel een rol in, dan tekent elke
                    stamboom de lijn en schrijft de server de andere kant erbij. */}
                {(field.kind === 'entry_link' || field.kind === 'entry_links') && (
                  <div style={{ flex: '1 1 100%', order: 2 }}>
                    <select
                      className="select"
                      aria-label={`Rol in een stamboom van veld ${index + 1}`}
                      value={field.role ?? ''}
                      onChange={(event) => setRole(index, event.target.value)}
                      style={{ minHeight: 38 }}
                    >
                      <option value="">Rol in een stamboom: —</option>
                      {FIELD_ROLES.map((role) => (
                        <option key={role} value={role}>
                          Rol in een stamboom: {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <span className="tiny muted" style={{ display: 'block', marginTop: '0.2rem' }}>
                      Met een rol tekent elke stamboom deze lijn, en vult het archief de
                      andere kant zelf in (Ouder ↔ Kind, Partner ↔ Partner, Broer of zus ↔
                      Broer of zus). Verwant wordt wel getekend en niet gespiegeld.
                    </span>
                  </div>
                )}
                {(field.kind === 'entry_link' || field.kind === 'entry_links') && (
                  <div style={{ flex: '1 1 100%', order: 1 }}>
                    <span className="tiny muted">Alleen deze soorten mogen erin (leeg = alles)</span>
                    <div className="row-wrap" style={{ marginTop: '0.2rem' }}>
                      {types.map((option) => {
                        const on = field.ofType?.includes(option.slug) ?? false;
                        return (
                          <button
                            key={option.slug}
                            type="button"
                            className={`chip chip-selectable${on ? ' chip-active' : ''}`}
                            aria-pressed={on}
                            onClick={() => {
                              const current = field.ofType ?? [];
                              patchField(index, {
                                ofType: on
                                  ? current.filter((slug) => slug !== option.slug)
                                  : [...current, option.slug],
                              });
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* §80: dezelfde sleutel als een ander veld. `cleanFields`
                    houdt de eerste en laat deze vallen — stil, tot nu. */}
                {Boolean(field.key) && clashing.has(field.key) && (
                  <span
                    className="error-note tiny"
                    data-testid="veld-sleutel-botsing"
                    data-field-key={field.key}
                    style={{ flex: '1 1 100%', order: 3, margin: 0 }}
                  >
                    Er is al een veld met de {words.fieldKey.toLowerCase()} <code>{field.key}</code>
                    . Zo opslaan bewaart alleen het bovenste van de twee.
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} omhoog`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} omlaag`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} verwijderen`}
                  onClick={() => removeField(index)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-small"
            style={{ marginTop: '0.4rem' }}
            onClick={addField}
          >
            <Icon name="plus" size={15} />
            Veld toevoegen
          </button>
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
            <div className="row-wrap">
              <span style={{ flex: '1 1 10rem' }}>
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
              <span style={{ flex: '1 1 14rem' }}>
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
        </div>

        {/*
          §11: plain Dutch, above the save, and always — not only once the
          address has been touched. Somebody about to rename a soort should read
          what it costs before they type, not after.
        */}
        <p className="small muted" style={{ margin: 0, maxWidth: '46rem' }}>
          <strong>Let op bij het adres.</strong> Verander je het adres, dan verhuist alles in het
          archief automatisch mee: de {words.entryPlural} van deze soort, en elk veld en elke lijst
          die deze soort noemt. Wat níet meeverhuist zijn links van buiten:{' '}
          <code>/wiki/{type.slug}</code> en opgeslagen filter-links met dit adres erin werken daarna
          niet meer.
        </p>

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

        {save.error && <p className="error-note">{save.error}</p>}
        {save.ok && <p className="small muted">{save.ok}</p>}

        <div className="row-wrap">
          <button className="btn btn-small btn-primary" type="submit" disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <div className="spacer" />
          {type.entryCount === 0 && (
            <button className="btn btn-small btn-danger" type="submit" formAction={removeAction}>
              <Icon name="trash" size={14} />
              Soort verwijderen
            </button>
          )}
        </div>
        {remove.error && <p className="error-note">{remove.error}</p>}
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
