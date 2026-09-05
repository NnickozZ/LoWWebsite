/**
 * §22: reading or editing an artikel.
 *
 * The page has two faces. *Lezen* is what a wiki article looks like to
 * everybody else on the web — a title, a picture and its facts on the right,
 * prose underneath, nothing that asks to be filled in. *Bewerken* is the page
 * this archive had before: every line an input, the infobox a form.
 *
 * Which one a person lands in is theirs to decide, in Jouw account. Until they
 * do, their role decides: a Keeper writes the archive, so a Keeper lands in
 * Bewerken; everyone else came to read, so they land in Lezen. Either way the
 * toggle at the top of the artikel switches faces, and it is not a right — a
 * player who may only propose still gets to open the editing face, their
 * changes simply travel as proposals (§10, §17).
 */
export type ArticleMode = 'view' | 'edit';

/** What a person chose. The empty string is "whatever my role does". */
export type ArticleModePref = '' | ArticleMode;

export function cleanArticleModePref(value: unknown): ArticleModePref {
  return value === 'view' || value === 'edit' ? value : '';
}

/** The face this person's artikel opens in. */
export function articleModeFor(
  pref: ArticleModePref | null | undefined,
  isKeeper: boolean,
): ArticleMode {
  if (pref === 'view' || pref === 'edit') return pref;
  return isKeeper ? 'edit' : 'view';
}

/** What the account page calls each choice. */
export const ARTICLE_MODE_CHOICES: { value: ArticleModePref; label: string; hint: string }[] = [
  {
    value: '',
    label: 'Wat bij mij hoort',
    hint: 'Een Keeper begint met bewerken, iedereen anders met lezen.',
  },
  {
    value: 'view',
    label: 'Altijd lezen',
    hint: 'Een artikel opent als leespagina. De knop bovenaan zet het alsnog open.',
  },
  {
    value: 'edit',
    label: 'Altijd bewerken',
    hint: 'Een artikel opent meteen met alle velden open.',
  },
];
