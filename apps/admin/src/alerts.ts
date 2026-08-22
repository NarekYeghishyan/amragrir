/**
 * Making a reminder audible in a room where nobody is watching the screen.
 *
 * The bell in the header answers "what was I told", and it answers it only to
 * somebody already looking at this tab. A kitchen is the case where that is not
 * enough: `prep_due` is raised by a job a minute before work has to start, and
 * the person it is for is at a stove with the panel on a counter behind them. A
 * badge that changes silently is, for that reader, no notification at all.
 *
 * Two ways of reaching them, deliberately different in kind:
 *
 * - **A chime**, which needs no permission and works while the tab is open but
 *   unwatched. This is the one that matters in a kitchen, and it is on by
 *   default.
 * - **A desktop notification**, which reaches a tab that is not even in front,
 *   and which the browser will only grant from a click.
 *
 * **Why this is not `apps/web/src/lib/browser-alerts.ts`.** That file solves the
 * customer's version of the problem and is the right shape for it: no sound — a
 * phone buzzing is the OS's job, not the page's — and a service worker, because
 * Android Chrome refuses `new Notification()` and a customer is typically on a
 * phone. This panel is the opposite case: a desktop or a counter tablet, where
 * sound is the whole point and a worker would be infrastructure bought for
 * nothing. Merging the two would mean one module carrying the union of both
 * sets of constraints, and the shared package they would have to live in is
 * consumed by the API, which has no DOM at all.
 */

/** Where this browser stands on desktop notifications. */
export type AlertState = 'unsupported' | 'default' | 'granted' | 'denied';

/** Remembered per browser rather than per account: it is a fact about this
 *  machine in this room — the panel by the pass wants sound, the manager's
 *  laptop in a meeting may not. */
const CHIME_KEY = 'amragrir.admin.chime';

/**
 * On unless somebody said otherwise.
 *
 * The opposite default from the customer's alerts, for the reason above: a back
 * office is opened *in order to* be told things, and a kitchen that has to
 * discover a setting before it can hear a reminder has already missed one.
 * Nobody is interrupted at home by this — it only ever sounds in a tab somebody
 * signed into deliberately.
 */
export function chimeEnabled(): boolean {
  try {
    return window.localStorage.getItem(CHIME_KEY) !== 'off';
  } catch {
    // Storage can throw outright rather than merely come back empty — a browser
    // set to block site data, a private window. Sound on is the safer of the
    // two wrong answers.
    return true;
  }
}

export function setChimeEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(CHIME_KEY, on ? 'on' : 'off');
  } catch {
    // The toggle still moves for this session; it just will not be remembered.
  }
}

/**
 * One `AudioContext`, made on demand and kept.
 *
 * Building one per chime leaks: a context holds an audio device handle and
 * browsers cap how many a page may have, so a panel open all shift would
 * eventually stop making any sound at all.
 */
let context: AudioContext | null = null;

type WithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function audio(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  context ??= new Ctor();
  return context;
}

/**
 * Wakes the audio device on the first interaction anywhere.
 *
 * Every browser starts an `AudioContext` suspended until the page has been
 * interacted with — a rule aimed at pages that make noise at a visitor who
 * never asked. A panel can be signed into and then left alone for an hour, so
 * the gesture that unlocks sound has to be *any* gesture, caught once, rather
 * than the press of some control nobody thinks to look for.
 *
 * Returns the function that removes the listeners, for a caller that unmounts.
 */
export function armChime(): () => void {
  const wake = (): void => {
    const ctx = audio();
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
  };

  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });

  return () => {
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
}

/** Peak gain: audible across a kitchen, short of the volume that gets a panel
 *  muted by whoever is standing next to it. */
const PEAK = 0.14;

/** Two notes rather than one. A single beep reads as an error sound, and this
 *  has to be recognisable as *the pass* from across a room. */
const NOTES: ReadonlyArray<{ hz: number; at: number }> = [
  { hz: 880, at: 0 },
  { hz: 1_318.5, at: 0.16 },
];

const NOTE_LENGTH = 0.19;

/**
 * Sounds the chime, if this browser has one and nobody turned it off.
 *
 * Synthesised rather than played from a file: an asset is a request that can
 * fail on a panel whose network is having the same bad minute that produced the
 * reminder, and two notes are cheaper to generate than to fetch.
 *
 * Silent rather than throwing on every failure path — this is called from the
 * handler that has just put the notification on screen, and the notification is
 * the part that has to survive.
 */
export function playChime(): void {
  if (!chimeEnabled()) {
    return;
  }

  const ctx = audio();
  if (!ctx) {
    return;
  }

  // Still suspended means no gesture has reached this tab yet. Ask, and let this
  // one chime go unheard rather than queue a noise to arrive out of its moment.
  if (ctx.state === 'suspended') {
    void ctx.resume();
    return;
  }

  try {
    const now = ctx.currentTime;

    for (const note of NOTES) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.at;

      oscillator.type = 'sine';
      oscillator.frequency.value = note.hz;

      // Ramped rather than switched: a gain that jumps from zero is a click,
      // which is the part of a cheap notification sound that sounds cheap.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(PEAK, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LENGTH);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_LENGTH + 0.02);
    }
  } catch {
    // A device that went away mid-shift, a headset unplugged. The row is on
    // screen either way.
  }
}

/**
 * What the browser will currently allow.
 *
 * No service-worker requirement here, unlike the customer's site: this panel
 * runs where `new Notification()` is supported directly.
 */
export function alertState(): AlertState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as AlertState;
}

/**
 * Asks, once, from a press.
 *
 * Only ever from a real click: a prompt raised on load is refused or penalised
 * by every current browser, and `denied` cannot be re-asked from here — which
 * is why the control that calls this stops being offered once it has been
 * answered.
 */
export async function requestAlerts(): Promise<AlertState> {
  if (alertState() === 'unsupported') {
    return 'unsupported';
  }
  return (await Notification.requestPermission()) as AlertState;
}

/**
 * Raises one desktop notification, if it was allowed.
 *
 * `tag` collapses repeats onto one another — an order that produces a second
 * reminder should replace its first rather than stack beside it.
 */
export function raiseAlert(alert: { title: string; body: string; tag: string }): void {
  if (alertState() !== 'granted') {
    return;
  }

  try {
    new Notification(alert.title, { body: alert.body, tag: alert.tag });
  } catch {
    // Chrome on Android throws here rather than returning — it wants a service
    // worker. The chime and the bell carry the same news.
  }
}
