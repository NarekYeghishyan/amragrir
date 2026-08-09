import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertState, raiseAlert, requestAlerts } from './browser-alerts';

const here = dirname(fileURLToPath(import.meta.url));
const middleware = join(here, '..', 'middleware.ts');
const worker = join(here, '..', '..', 'public', 'notifications-sw.js');

/**
 * The browser alert — see SCREENS.md §15.
 *
 * These run under vitest's `node` environment, where `window` genuinely does
 * not exist, which is the right starting point: the first thing this module has
 * to get right is *not* touching an API that is missing, because it is imported
 * by a component that renders on the server.
 */

/** Puts a browser in the room, with whatever pieces the case is about. */
function browser(options: {
  permission?: NotificationPermission;
  request?: () => Promise<NotificationPermission>;
  serviceWorker?: unknown;
  showNotification?: ReturnType<typeof vi.fn>;
}) {
  const showNotification = options.showNotification ?? vi.fn().mockResolvedValue(undefined);
  const worker =
    options.serviceWorker === null
      ? undefined
      : (options.serviceWorker ?? {
          register: vi.fn().mockResolvedValue({}),
          ready: Promise.resolve({ showNotification }),
        });

  vi.stubGlobal('window', {
    Notification: { permission: options.permission ?? 'default' },
  });
  vi.stubGlobal('Notification', {
    permission: options.permission ?? 'default',
    requestPermission: options.request ?? vi.fn().mockResolvedValue('granted'),
  });
  vi.stubGlobal('navigator', worker ? { serviceWorker: worker } : {});
  return { showNotification, worker };
}

afterEach(() => vi.unstubAllGlobals());

describe('alertState', () => {
  it('is unsupported on the server, where there is no window at all', () => {
    // This module is imported by a component that renders server-side. Reading
    // `Notification` there would be a crash on every page, not a missing bell.
    expect(alertState()).toBe('unsupported');
  });

  it('is unsupported without a service worker, because Android Chrome needs one', () => {
    // `new Notification()` is refused on Android Chrome; the worker is the only
    // way to show one, and a phone with the site open is the case this is for.
    browser({ permission: 'default', serviceWorker: null });
    expect(alertState()).toBe('unsupported');
  });

  it.each(['default', 'granted', 'denied'] as const)('reports %s as the browser has it', (p) => {
    browser({ permission: p });
    expect(alertState()).toBe(p);
  });
});

describe('requestAlerts', () => {
  it('registers the worker once permission is given', async () => {
    const { worker } = browser({ request: vi.fn().mockResolvedValue('granted') });
    await expect(requestAlerts()).resolves.toBe('granted');
    expect((worker as { register: ReturnType<typeof vi.fn> }).register).toHaveBeenCalledWith(
      '/notifications-sw.js',
    );
  });

  it('does not register a worker for a refusal', async () => {
    const { worker } = browser({ request: vi.fn().mockResolvedValue('denied') });
    await expect(requestAlerts()).resolves.toBe('denied');
    expect((worker as { register: ReturnType<typeof vi.fn> }).register).not.toHaveBeenCalled();
  });

  it('reports granted-but-unregisterable as unsupported, because that is what it is', async () => {
    // An insecure origin that is not localhost. The permission is real and the
    // alert can still never be shown, so offering the control again would be a
    // button that does nothing.
    browser({
      request: vi.fn().mockResolvedValue('granted'),
      serviceWorker: { register: vi.fn().mockRejectedValue(new Error('insecure')) },
    });
    await expect(requestAlerts()).resolves.toBe('unsupported');
  });
});

describe('the worker has to be served from the root', () => {
  it('is excluded from the language middleware', () => {
    // It was not, and the file 404'd: the middleware rewrote it into the
    // `[lang]` tree. Worse than a 404 if it had been served there — a service
    // worker's scope *is* its URL path, so `/ru/notifications-sw.js` could only
    // control `/ru/`, and alerts would work in one language and silently not in
    // the others.
    expect(readFileSync(middleware, 'utf8')).toContain('notifications-sw.js');
  });

  it('exists where `requestAlerts` registers it', () => {
    expect(() => readFileSync(worker, 'utf8')).not.toThrow();
  });

  it('registers nothing that would put it in front of the site', () => {
    // A `fetch` handler would make this a PWA shell for every request — a large
    // thing to take on for a bell, and hard to undo in a browser that has
    // already installed it.
    expect(readFileSync(worker, 'utf8')).not.toContain("addEventListener('fetch'");
  });
});

describe('raiseAlert', () => {
  const alert = { title: 'Ready', body: 'Come pick it up', url: '/orders/o1', tag: 'o1' };

  it('shows one through the worker, carrying where to go', async () => {
    const { showNotification } = browser({ permission: 'granted' });
    await raiseAlert(alert);
    expect(showNotification).toHaveBeenCalledWith('Ready', {
      body: 'Come pick it up',
      tag: 'o1',
      data: { url: '/orders/o1' },
    });
  });

  it('tags by order, so six stages replace one alert rather than stacking six', async () => {
    const { showNotification } = browser({ permission: 'granted' });
    await raiseAlert({ ...alert, title: 'Preparing' });
    await raiseAlert({ ...alert, title: 'Ready' });
    const tags = showNotification.mock.calls.map(([, options]) => (options as { tag: string }).tag);
    expect(new Set(tags).size).toBe(1);
  });

  it.each(['default', 'denied'] as const)('stays silent on %s', async (permission) => {
    const { showNotification } = browser({ permission });
    await raiseAlert(alert);
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('swallows a worker that went away — the header bell has the same news', async () => {
    browser({
      permission: 'granted',
      serviceWorker: { register: vi.fn(), ready: Promise.reject(new Error('gone')) },
    });
    await expect(raiseAlert(alert)).resolves.toBeUndefined();
  });
});
