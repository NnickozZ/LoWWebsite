'use client';

import { useLinkStatus } from 'next/link';
import { useLayoutEffect, useRef } from 'react';

/**
 * §102 (ronde 65·b, J2): het vakje dat je aanklikt, tekent meteen dat het
 * gehoord is.
 *
 * Staat *binnen* een `<Link>` — de zijbalk, de deuren van jouw plek en de
 * tabbalk — want `useLinkStatus()` antwoordt alleen voor de link waar hij in
 * staat. Zolang die navigatie loopt, krijgt het `<a>` zelf `data-pending`, en
 * `app/navigatie.css` tekent het dan als het actieve vakje.
 *
 * **De tekening loopt vooruit, de waarheid niet** (ronde 65, beslissing 4):
 * `aria-current` blijft op het oude vakje tot de nieuwe pagina er is. Een
 * schermlezer hoort dus waar je bent, niet waar je heen wilt; alleen het oog
 * krijgt het teken eerder. Daarom een attribuut dat niets betekent voor de
 * toegankelijkheidsboom, en geen `aria-current` of `aria-busy`.
 *
 * Een navigatie die vooraf helemaal is opgehaald, is klaar voordat `pending`
 * ooit waar wordt — dan gebeurt hier niets, en dat is goed.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  const mark = useRef<HTMLTemplateElement>(null);
  useLayoutEffect(() => {
    const link = mark.current?.closest('a');
    if (!link) return;
    if (pending) link.setAttribute('data-pending', '');
    else link.removeAttribute('data-pending');
    return () => link.removeAttribute('data-pending');
  }, [pending]);
  // Een `<template>`: inert en zonder vorm, en geen `span` — specs en regels
  // meten de `span`s in een tab (`ronde-52-jouw-plek`, "geen tablabel is
  // afgekapt").
  return <template ref={mark} className="nav-pending-mark" />;
}
