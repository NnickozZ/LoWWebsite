'use client';

import { useRef, useSyncExternalStore } from 'react';

/**
 * §103 golf H (T8): het antwoord van de server, meteen op het scherm.
 *
 * Na een koop stond de melding *… −2 munten* er op ±200 ms, en het getal in de
 * schil pas op ±2,4 s: de koopknop houdt de live-verversing vast tot de stempel
 * *Gekocht* geland is (§103 herstel, #6), en het saldo kwam met die verversing
 * mee. De speler las eerst "−2" en zag dan nog een tel het oude getal.
 *
 * Het antwoord van `buy` (en `unlock`, `terug`, `uitdelen`) draagt de nieuwe
 * balans al — `balanceOf` na de transactie, dus de som van het grootboek, een
 * **serverwaarde**. Deze module is het briefje waarmee die waarde de getallen
 * bereikt die haar tonen, zonder op de verversing te wachten: de knop roept
 * `announceBalance(kamer, balans)`, en elk `SaldoGetal` van die kamer rolt
 * ernaartoe. Alleen de *rij* in de winkel blijft vastgehouden tot na de stempel.
 *
 * §102 regel 6 blijft staan: het getal beweegt alleen van de ene serverwaarde
 * naar de andere. Er wordt hier niets opgeteld of voorspeld; een weigering
 * kondigt niets aan.
 *
 * **Welke kamer is de schil?** De getallen in de zijbalk en op de Jij-tab
 * (`JouwPlek`) tonen de beurs van het karakter dat je speelt, en weten zelf
 * niet welke kamer dat is. `useShellBeurs` — één keer gemount in de schil, met
 * die beurs — zegt het hier (`setShellRoom`). Een `SaldoGetal` zonder `room`
 * volgt dus de schil; `Beurs` geeft altijd een `room` mee (of `null`: volg
 * niets), zodat een beurs van een ander nooit het getal van jouw kamer krijgt.
 */

export type Announced = { balance: number; seq: number };

const known = new Map<string, Announced>();
let shellRoom: string | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** De server zei net: in deze kamer staat nu `balance`. */
export function announceBalance(roomId: string | null | undefined, balance: unknown) {
  if (!roomId || typeof balance !== 'number' || !Number.isFinite(balance)) return;
  seq += 1;
  known.set(roomId, { balance, seq });
  emit();
}

/** De kamer waarvan de schil de beurs toont (`useShellBeurs`). */
export function setShellRoom(roomId: string | null) {
  if (shellRoom === roomId) return;
  shellRoom = roomId;
  emit();
}

/** Alleen voor de unit-test: de module leeg. */
export function resetSaldo() {
  known.clear();
  shellRoom = null;
  seq = 0;
  emit();
}

/** Het laatst aangekondigde antwoord voor een kamer. `undefined` is de kamer van de schil; `null` is niets. */
export function announcedFor(room: string | null | undefined): Announced | null {
  const id = room === undefined ? shellRoom : room;
  return id ? (known.get(id) ?? null) : null;
}

/**
 * Welk getal een saldo nu toont. Puur, zodat de regel te testen is.
 *
 * `hold` is een aankondiging die kwam terwijl de prop `basis` was: zolang de
 * prop nog steeds `basis` is, heeft de verversing ons niet ingehaald en geldt
 * het antwoord van de knop. Verandert de prop, dan is de server opnieuw
 * gehoord en wint hij.
 */
export function shownBalance(value: number, hold: { basis: number; balance: number } | null): number {
  return hold && hold.basis === value ? hold.balance : value;
}

/**
 * De aankondiging voor dit getal, als die kwam **nadat** het getal verscheen.
 * Een oudere (van vóór een navigatie) telt niet: de pagina bracht toen al
 * een nieuwere serverwaarde mee.
 */
export function useAnnounced(room: string | null | undefined): Announced | null {
  const current = useSyncExternalStore(
    subscribe,
    () => announcedFor(room),
    () => null,
  );
  const seen = useRef<number | null>(null);
  if (seen.current === null) seen.current = current?.seq ?? 0;
  return current && current.seq > seen.current ? current : null;
}
