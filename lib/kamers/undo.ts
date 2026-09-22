/**
 * §93: het venster van *Ongedaan maken* na een koop. Puur, zodat de melding in
 * de browser en `undoPurchase` op de server hetzelfde getal lezen — de service
 * zelf laadt de database en mag niet in een client-component terechtkomen.
 *
 * De melding toont de knop tien seconden; de server geeft er een paar bij voor
 * een trage lijn en een klik op de laatste tel.
 */
export const BUY_UNDO_SECONDS = 10;
export const BUY_UNDO_MS = BUY_UNDO_SECONDS * 1000;
export const BUY_UNDO_GRACE_SECONDS = 5;
