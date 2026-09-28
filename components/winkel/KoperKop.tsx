'use client';

import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { MEANING } from '@/components/kamer/plekWords';
import { fill, type Words } from '@/lib/words';
import { useKiezerInBeeld } from './kiezerZicht';

/**
 * §103 golf H (T17): voor wie je koopt, één keer, als de kiezer uit beeld is.
 *
 * §103 (K6) zette de naam van de onderzoeker op élke koopknop zodra de kiezer
 * bovenaan uit beeld scrolde (*Kopen voor Dr. Elsje Kramer → bureau*). Dat
 * klopte als informatie en was onrustig als beeld: terwijl de duim scrolde,
 * groeiden alle knoppen tegelijk van tekst, en op 360 px werd de lange vorm
 * krap. Nu zegt de knop altijd hetzelfde, en de koper staat één keer bovenaan
 * het venster, in een pil die plakt: *Kopen voor Dr. Elsje Kramer · ◎ 32*.
 *
 * Hij neemt geen ruimte in (hoogte 0, de pil hangt eronder), dus er verschuift
 * niets als hij komt of gaat; alleen opacity en een paar pixels transform.
 * Voor een schermlezer staat hij er niet: elke koopknop draagt de hele zin
 * met de naam al als toegankelijke naam (§90).
 */
export function KoperKop({
  name,
  balance,
  roomId,
  words,
}: {
  name: string;
  balance: number;
  roomId: string;
  words: Words;
}) {
  const kiezerInBeeld = useKiezerInBeeld(true);
  return (
    <div className="koper-kop" data-testid="koper-kop" data-shown={kiezerInBeeld ? undefined : 'ja'} aria-hidden="true">
      <span className="koper-kop-pil">
        <Icon name={MEANING.onderzoeker} size={13} />
        <span className="koper-kop-naam">{fill(words.shopForName, { naam: name })}</span>
        <Beurs balance={balance} words={words} size="small" room={roomId} />
      </span>
    </div>
  );
}
