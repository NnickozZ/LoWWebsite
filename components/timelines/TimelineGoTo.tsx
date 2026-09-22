'use client';

import { useId, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { AUTHOR_GATE_OFF } from '@/lib/canvas/authorGate';
import { parseGoTo } from '@/lib/timelines/span';
import type { Precision } from '@/lib/timelines/time';

/**
 * §94 (C16) — "Ga naar…" op een tijdlijn.
 *
 * Een jaar vinden was zoomen, schuiven en ticks lezen: vier tot zes handelingen
 * en raden. Dit is één vak: typ `1934`, `maart 1934` of `14-3-1934`, Enter, en
 * de as staat om die datum (`goToView` in `lib/timelines/span.ts`). Op een
 * computer staat het in de werkbalk naast de zoomknoppen; op een telefoon in
 * het blad achter het tandwiel, waar ruimte is voor een toetsenbord.
 *
 * Het schrijft niets, dus het vraagt §18b's vraag nooit (`AUTHOR_GATE_OFF`),
 * en het werkt in Lezen en in Bewerken.
 */
export function TimelineGoTo({
  onGo,
  className,
  testId = 'timeline-goto',
}: {
  onGo: (at: number, precision: Precision) => void;
  className?: string;
  testId?: string;
}) {
  const ui = useUi();
  const id = useId();
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);
  const go = () => {
    const found = parseGoTo(text);
    if (!found) {
      setWrong(true);
      return;
    }
    setWrong(false);
    onGo(found.at, found.precision);
  };
  return (
    <form
      className={`timeline-goto${className ? ` ${className}` : ''}`}
      role="search"
      data-testid={testId}
      {...AUTHOR_GATE_OFF}
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {ui.words.goToDate}
      </label>
      <Icon name="calendar" size={14} aria-hidden="true" />
      <input
        id={id}
        className="input timeline-goto-input"
        value={text}
        inputMode="text"
        autoComplete="off"
        placeholder={`${ui.words.goToDate} ${ui.words.goToDateHint}`}
        aria-invalid={wrong || undefined}
        aria-describedby={wrong ? `${id}-wrong` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          if (wrong) setWrong(false);
        }}
        onKeyDown={(event) => {
          // The stage's own keys (+ − 0, the arrows) must not fire while typing a year.
          event.stopPropagation();
        }}
      />
      {wrong && (
        <span className="tiny timeline-goto-wrong" id={`${id}-wrong`} role="status">
          {ui.words.goToDateUnknown}
        </span>
      )}
    </form>
  );
}
