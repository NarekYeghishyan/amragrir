/**
 * The browser's own notification, for when the tab is not the one being looked
 * at.
 *
 * The bell in the header only helps somebody who is looking at this site. An
 * order takes twenty minutes to cook and nobody watches a header for twenty
 * minutes, so "ready" has to be able to reach a tab in the background — which
 * is the one thing a page cannot do for itself and the browser can.
 *
 * **This is not Web Push.** There is no push subscription, no VAPID key and no
 * server delivery: the alert is raised by this page, from the stream it is
 * already holding open, and it therefore only happens while the site is open
 * somewhere. Real push — an alert with the site closed — needs credentials that
 * live outside this repository (API_DOCUMENTATION.md, `POST /devices`).
 */

/** Where the visitor stands, as far as this app is concerned. */
export type AlertState = 'unsupported' | 'default' | 'granted' | 'denied';

const SERVICE_WORKER = '/notifications-sw.js';

/**
 * What the browser will currently allow.
 *
 * `unsupported` covers more than old browsers: **iOS Safari has no
 * `Notification` at all until the site is installed to the home screen**, so a
 * plain visit on an iPhone lands here. That is a platform rule this app cannot
 * argue with, and the honest response is to not offer a control that would do
 * nothing — the in-app bell still works there, which is why it is not built on
 * top of this.
 */
export function alertState(): AlertState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  // A worker is required on Android Chrome, which refuses `new Notification()`.
  if (!('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  return Notification.permission as AlertState;
}

/**
 * Asks, once, from a press.
 *
 * **Only ever from a real click** — every browser now refuses or penalises a
 * permission prompt raised on load, and a visitor who has not asked for alerts
 * being interrupted to refuse them is how a site loses the ability to ask
 * again. `denied` is permanent from this app's side: nothing here can re-ask,
 * and the control stops being offered.
 */
export async function requestAlerts(): Promise<AlertState> {
  if (alertState() === 'unsupported') {
    return 'unsupported';
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission as AlertState;
  }

  try {
    await navigator.serviceWorker.register(SERVICE_WORKER);
    return 'granted';
  } catch {
    // Granted but unusable — a worker that will not register (an insecure
    // origin that is not localhost, a browser with workers switched off).
    // Reported as unsupported, because that is what it is from here.
    return 'unsupported';
  }
}

/**
 * Raises one alert, if the visitor allowed it.
 *
 * Silent when they did not, rather than throwing: this is called from the
 * stream handler, where the notification arriving is the important part and the
 * alert is the extra. `tag` collapses repeats — an order moving through six
 * stages should replace its own alert rather than stack six of them, and the
 * order id is what makes that the same order rather than the same word.
 */
export async function raiseAlert(alert: {
  title: string;
  body: string;
  url: string;
  tag: string;
}): Promise<void> {
  if (alertState() !== 'granted') {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(alert.title, {
      body: alert.body,
      tag: alert.tag,
      data: { url: alert.url },
      // No `requireInteraction`: an order status is worth a glance, not a
      // notification that sits on screen until it is dismissed.
    });
  } catch {
    // A worker that went away, a browser that refused at the last moment. The
    // bell in the header has the same news and is unaffected.
  }
}
