import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { PanelDoor } from '@/components/spelers/PanelDoor';
import type { CharacterLite } from '@/lib/characters';
import type { SpelerLite } from '@/lib/spelers/service';
import { fill, type Words } from '@/lib/words';

export type KaraktersData = {
  characters: CharacterLite[];
  activeId: string | null;
};

/**
 * §77, panel 2: the faces this account wears.
 *
 * A few portraits and a door, and nothing that can be changed here — switching
 * karakter is the wardrobe's job and lives on `/you` (§18c: wearing is the
 * player's, casting is the Keeper's). §50: the cover is resolved before it is
 * drawn, crops and all, so a fiche has the same face here as in every list.
 */
export function KaraktersPanel({
  data,
  speler,
  words,
  isSelf,
}: {
  data: KaraktersData;
  speler: SpelerLite;
  words: Words;
  isSelf: boolean;
}) {
  // §18: a Keeper wears nobody. That is a rule, not an empty shelf, so it is
  // said in one line rather than drawn as a grid with nothing in it.
  if (speler.isKeeper) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        {fill(words.keeperWearsNone, { keeper: words.keeper, karakter: words.character })}
      </p>
    );
  }

  if (data.characters.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        {fill(words.charactersNone, { karakters: words.characterPlural })}
      </p>
    );
  }

  return (
    <>
      <ul className="speler-faces" aria-label={words.characterPlural}>
        {data.characters.map((character) => (
          <li key={character.entryId}>
            <Link
              className={`speler-face${character.entryId === data.activeId ? ' speler-face-worn' : ''}`}
              href={`/e/${character.slug}`}
            >
              <Cover
                assetId={character.coverAssetId}
                crop={character.coverCrop}
                shape="portrait"
                alt=""
                icon={character.typeIcon}
                colour={character.typeColour}
                variant="thumb"
                className="speler-face-cover"
              />
              <span className="speler-face-name">{character.name}</span>
              {character.entryId === data.activeId && (
                <span className="tiny speler-face-now">{words.wearsNow}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {isSelf && <PanelDoor href="/you#karakters">{words.toCharacters}</PanelDoor>}
    </>
  );
}
