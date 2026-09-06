/**
 * §22: reading or editing — an artikel, and (since §23) a dossier too.
 *
 * The page has two faces. *Lezen* is what a wiki article looks like to
 * everybody else on the web — a title, a picture and its facts on the right,
 * prose underneath, nothing that asks to be filled in. *Bewerken* is the page
 * this archive had before: every line an input, the infobox a form.
 *
 * A dossier wears the same pair. It is the same reading: a name, a one-liner,
 * the working theory, and the file's contents — where the editing face has a
 * search box above every shelf and a caret in the notes.
 *
 * **Everybody lands on Lezen, a Keeper included** (round 13). There is no
 * setting for this any more: the face is a thing about *this visit*, not about
 * the person, so it is not remembered anywhere and every page opens the way a
 * reader would want it. The toggle at the top of the page crosses over, and it
 * is not a right — a player who may only propose still gets to open the
 * editing face, their changes simply travel as proposals (§10, §17).
 *
 * The one thing that overrides it is `?new=1`: an artikel or dossier you have
 * just made this second opens in Bewerken, because you are there to fill it in.
 */
export type ArticleMode = 'view' | 'edit';
