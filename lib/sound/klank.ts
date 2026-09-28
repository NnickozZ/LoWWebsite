import { KLANK_MASTER, RECIPES, SILENT, type Klank, type Voice } from './recipes';

/**
 * §103 (K8): geluid in de kamer — opt-in, standaard uit, per browser.
 *
 * Nick, ronde 66: *"geluid ja, opt-in, standaard uit."* Vier klanken
 * (`lib/sound/recipes.ts`), gesynthetiseerd met Web Audio: geen bestand, geen
 * dependency, niets dat laadt.
 *
 * **Eén `AudioContext` voor de hele tab, en pas na een gebaar.** Een browser
 * laat een context die zonder klik of toets gemaakt is, stil (`suspended`), en
 * een context per klank is een lek. Dus: niets zolang het geluid uit staat — dan
 * wordt er ook geen context gemaakt, en een test kan dat tellen —, en als het
 * aan staat de eerste keer bij een `pointerdown` of `keydown` (`primeKlank`),
 * of bij de eerste klank die zelf uit een klik komt. Een munt die binnenkomt
 * zonder dat iemand iets aanraakte (K4), speelt alleen als de context er al is
 * en loopt; anders zwijgt hij, en dat is beter dan een geluid dat de browser
 * weigert.
 *
 * **Nooit bij navigatie, typen of opslaan.** Dat is geen regel in deze module
 * maar in wie hem aanroept: alleen kopen, neerzetten, een plek openen en een
 * gift die binnenkomt roepen `play`.
 *
 * De voorkeur is van één kijker in één browser (`localStorage`), zoals een
 * dichtgeklapt blok: geen account-instelling, want een telefoon in de trein en
 * een laptop aan tafel willen niet hetzelfde. Elke lees- en schrijfactie in een
 * `try`: in een privévenster kan de opslag gooien, en dan staat het geluid uit.
 */

export const KLANK_KEY = 'low:klank';

/** Wie wil weten dat de schakelaar omging (de schakelaar zelf, in een ander blok). */
const listeners = new Set<() => void>();

export function soundOn(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KLANK_KEY) === 'aan';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KLANK_KEY, 'aan');
    else window.localStorage.removeItem(KLANK_KEY);
  } catch {
    /* geen opslag: dan blijft het uit */
  }
  for (const listener of listeners) listener();
}

export function onSoundChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Ctx = AudioContext;
let shared: Ctx | null = null;
let noise: AudioBuffer | null = null;

/** De gedeelde context: gemaakt bij de eerste vraag, en daarna altijd dezelfde. */
function context(create: boolean): Ctx | null {
  if (typeof window === 'undefined' || !soundOn()) return null;
  if (!shared && create) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      shared = new Ctor();
    } catch {
      return null;
    }
  }
  if (shared && shared.state === 'suspended' && create) void shared.resume().catch(() => undefined);
  return shared;
}

/**
 * Eén keer per tab: bij het eerste gebaar met het geluid aan, de context maken
 * of wekken. `capture`, zodat een knop die zelf `stopPropagation` doet het
 * gebaar niet inslikt. Geeft een opruimer terug.
 */
export function primeKlank(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const wake = () => {
    if (soundOn()) context(true);
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);
  return () => {
    window.removeEventListener('pointerdown', wake, true);
    window.removeEventListener('keydown', wake, true);
  };
}

function noiseBuffer(ctx: Ctx): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const length = Math.ceil(ctx.sampleRate * 0.3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

function voice(ctx: Ctx, out: AudioNode, v: Voice, t0: number) {
  const start = t0 + v.at;
  const end = start + v.attack + v.decay;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.linearRampToValueAtTime(v.peak, start + v.attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
  gain.connect(out);
  if (v.kind === 'sine') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(v.freq, start);
    if (v.glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(v.glideTo, end);
    osc.connect(gain);
    osc.start(start);
    osc.stop(end + 0.02);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = v.filter;
    filter.frequency.setValueAtTime(v.cutoff, start);
    filter.Q.setValueAtTime(v.q, start);
    src.connect(filter);
    filter.connect(gain);
    src.start(start);
    src.stop(end + 0.02);
  }
}

/**
 * Speel één klank. `fromGesture` zegt of dit uit een klik komt (kopen, openen,
 * neerzetten): dan mag de context hier ontstaan. Een munt die binnenkomt
 * (`fromGesture: false`) gebruikt alleen een context die er al is en loopt.
 */
export function play(kind: Klank, { fromGesture = true }: { fromGesture?: boolean } = {}) {
  const ctx = context(fromGesture);
  if (!ctx || (!fromGesture && ctx.state !== 'running')) return;
  try {
    const master = ctx.createGain();
    master.gain.setValueAtTime(KLANK_MASTER, ctx.currentTime);
    master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.005;
    for (const v of RECIPES[kind].voices) voice(ctx, master, v, t0);
  } catch {
    /* een browser die iets van Web Audio mist, zwijgt liever dan dat hij gooit */
  }
}
