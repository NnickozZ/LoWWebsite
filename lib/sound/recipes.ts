/**
 * §103 (K8): de vier klanken van het expressieve register — als recept, puur.
 *
 * Geen bestanden en geen dependency: elke klank is een handvol stemmen (een
 * sinus of een ruisuitbarsting door een filter) met een korte envelop, en
 * `lib/sound/klank.ts` speelt ze af met Web Audio. Het recept staat hier los
 * van de browser zodat een test het kan **uitrekenen** (`renderOffline`): de
 * lengte, de piek, of hij stil begint en stil eindigt, en hoe helder hij is.
 * Niemand in deze ronde kon luisteren, dus is dat wat er gemeten wordt —
 * de golfvorm, niet de smaak.
 *
 * Vier regels, en de test houdt ze vast:
 *   1. **Kort**: elke klank is binnen 300 ms helemaal stil (README-regel 103).
 *   2. **Zacht**: de piek van de som komt nooit boven 0,15.
 *   3. **Warm, niet piepend**: geen grondtoon boven 3,2 kHz (daarboven alleen
 *      een boventoon op een tiende van de sterkte), de ruis door een filter dat
 *      het scherpe bovenin wegneemt, en het zwaartepunt van het spectrum onder
 *      de 3,5 kHz.
 *   4. **Geen tik aan de randen**: elke stem begint op nul en zakt exponentieel
 *      naar nul, zodat er geen klik in de luidspreker komt van een golf die
 *      halverwege afgekapt wordt.
 */

export type Klank = 'munt' | 'tik' | 'stempel' | 'sleutel';

export const KLANKEN: readonly Klank[] = ['munt', 'tik', 'stempel', 'sleutel'];

/** Een envelop: vanaf `at` in `attack` seconden naar `peak`, dan exponentieel weg in `decay`. */
type Envelope = { at: number; attack: number; peak: number; decay: number };

export type Voice =
  | ({
      kind: 'sine';
      /** Begintoon in Hz. */
      freq: number;
      /** Eindtoon, als de toon glijdt (een stempel zakt). */
      glideTo?: number;
    } & Envelope)
  | ({
      kind: 'noise';
      filter: 'lowpass' | 'bandpass' | 'highpass';
      /** Kantelpunt of midden van het filter, in Hz. */
      cutoff: number;
      q: number;
    } & Envelope);

export type Recipe = { voices: Voice[] };

/** De hele klank door één hoofdvolume: nooit harder dan dit, wat de stemmen ook doen. */
export const KLANK_MASTER = 0.14;

/** Het plafond van regel 103: elke klank is binnen deze tijd stil. */
export const KLANK_MAX_SECONDS = 0.3;

/** Waar een envelop "stil" is: -80 dB. De exponentiële helling eindigt hier. */
export const SILENT = 0.0001;

/**
 * Een munt: twee korte tonen, een kwint uit elkaar, elk met twee zachte
 * boventonen (2× en 3×) — genoeg om naar metaal te klinken zonder te fluiten.
 * Laag genoeg (C6 en G6) om een munt op hout te zijn en geen alarm.
 */
function coinNote(at: number, freq: number, peak: number): Voice[] {
  return [
    { kind: 'sine', freq, at, attack: 0.003, peak, decay: 0.17 },
    { kind: 'sine', freq: freq * 2, at, attack: 0.002, peak: peak * 0.22, decay: 0.09 },
    { kind: 'sine', freq: freq * 3, at, attack: 0.002, peak: peak * 0.07, decay: 0.05 },
  ];
}

export const RECIPES: Record<Klank, Recipe> = {
  munt: { voices: [...coinNote(0, 1046.5, 0.72), ...coinNote(0.075, 1568, 0.62)] },

  /*
   * Een houten tik: een ruisje van een paar milliseconden rond 1,8 kHz (het
   * contact) boven op een korte sinus van 420 Hz die meteen wegsterft (het hout
   * dat meeklinkt). Onder de 80 ms.
   */
  tik: {
    voices: [
      { kind: 'noise', filter: 'bandpass', cutoff: 1800, q: 2.5, at: 0, attack: 0.001, peak: 0.9, decay: 0.035 },
      { kind: 'sine', freq: 420, at: 0, attack: 0.002, peak: 0.55, decay: 0.06 },
    ],
  },

  /*
   * Een stempel: een doffe bons. Laaggefilterde ruis (het rubber op papier) en
   * een sinus die van 120 naar 70 Hz zakt (de hand op tafel). Geen hoge tonen,
   * dus hij is op een telefoonluidspreker vooral een "tok".
   */
  stempel: {
    voices: [
      { kind: 'noise', filter: 'lowpass', cutoff: 900, q: 0.7, at: 0, attack: 0.002, peak: 0.85, decay: 0.09 },
      { kind: 'sine', freq: 120, glideTo: 70, at: 0, attack: 0.003, peak: 0.8, decay: 0.12 },
    ],
  },

  /*
   * Een sleutel: twee klikjes van het slot, 90 ms na elkaar en het tweede iets
   * lager, met één zacht metalen tintje erachter (2,2 kHz, 70 ms). De klikjes
   * zijn ruis door een banddoorlaat — een sinus van 3 kHz zou piepen.
   */
  sleutel: {
    voices: [
      { kind: 'noise', filter: 'bandpass', cutoff: 2200, q: 1.4, at: 0, attack: 0.001, peak: 1.8, decay: 0.02 },
      { kind: 'noise', filter: 'bandpass', cutoff: 1700, q: 1.4, at: 0.09, attack: 0.001, peak: 1.8, decay: 0.024 },
      { kind: 'sine', freq: 2200, at: 0.095, attack: 0.002, peak: 0.3, decay: 0.07 },
    ],
  },
};

/** Waar een stem stil is: het einde van zijn exponentiële helling. */
export function voiceEnd(voice: Voice): number {
  return voice.at + voice.attack + voice.decay;
}

/** Hoe lang de hele klank duurt, tot de laatste stem stil is. */
export function recipeLength(recipe: Recipe): number {
  return Math.max(...recipe.voices.map(voiceEnd));
}

/**
 * De versterking van één stem op tijd `t` — precies de twee hellingen die
 * `klank.ts` op een `GainNode` zet: lineair naar de piek, dan exponentieel naar
 * `SILENT`. Buiten de stem nul.
 */
export function envelopeAt(voice: Envelope, t: number): number {
  const local = t - voice.at;
  if (local < 0) return 0;
  if (local < voice.attack) return SILENT + (voice.peak - SILENT) * (local / voice.attack);
  const d = local - voice.attack;
  if (d > voice.decay) return 0;
  return voice.peak * (SILENT / voice.peak) ** (d / voice.decay);
}

/** Een eenvoudige deterministische ruis, zodat een test elke keer hetzelfde uitrekent. */
function noiseSource(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** De biquad van de Web Audio-specificatie (RBJ-kookboek), voor de offline versie. */
function biquad(type: 'lowpass' | 'bandpass' | 'highpass', freq: number, q: number, rate: number) {
  const w = (2 * Math.PI * freq) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/**
 * De klank uitgerekend, sample voor sample, met dezelfde envelop, dezelfde
 * glijtoon en dezelfde filters als de browser — zodat een test over de
 * *golfvorm* kan redeneren. Het hoofdvolume zit erin.
 */
export function renderOffline(recipe: Recipe, rate = 44100): Float32Array {
  const length = Math.ceil((recipeLength(recipe) + 0.01) * rate);
  const out = new Float32Array(length);
  recipe.voices.forEach((voice, index) => {
    const noise = noiseSource(11 + index);
    const filter = voice.kind === 'noise' ? biquad(voice.filter, voice.cutoff, voice.q, rate) : null;
    let phase = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      let raw: number;
      if (voice.kind === 'sine') {
        const local = Math.max(0, t - voice.at);
        const span = voice.attack + voice.decay;
        const f =
          voice.glideTo === undefined
            ? voice.freq
            : voice.freq * (voice.glideTo / voice.freq) ** Math.min(1, local / span);
        phase += (2 * Math.PI * f) / rate;
        raw = Math.sin(phase);
      } else {
        raw = filter!(noise());
      }
      out[i] += raw * envelopeAt(voice, t) * KLANK_MASTER;
    }
  });
  return out;
}

/** De hoogste uitslag van een golfvorm. */
export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}

/**
 * Het zwaartepunt van het spectrum op het luidste stuk (een venster van 1024
 * samples), in Hz: een ruwe maat voor hoe helder iets klinkt. Een warme tik ligt
 * rond 1–2 kHz; boven de 3,5 kHz begint een kort geluid in een stille kamer te
 * piepen. Een gewone DFT met een Hann-venster — traag, maar het is een test.
 */
export function spectralCentroid(samples: Float32Array, rate = 44100): number {
  const size = 1024;
  let best = 0;
  let start = 0;
  for (let i = 0; i + size <= samples.length; i += 128) {
    let energy = 0;
    for (let j = 0; j < size; j += 1) energy += samples[i + j] ** 2;
    if (energy > best) {
      best = energy;
      start = i;
    }
  }
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < size / 2; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < size; n += 1) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
      const x = (samples[start + n] ?? 0) * hann;
      re += x * Math.cos((2 * Math.PI * k * n) / size);
      im -= x * Math.sin((2 * Math.PI * k * n) / size);
    }
    const magnitude = Math.hypot(re, im);
    weighted += ((k * rate) / size) * magnitude;
    total += magnitude;
  }
  return total ? weighted / total : 0;
}
