import { NextResponse } from 'next/server';
import { ApiError, apiWsUrl } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { bellWithToken } from '@/lib/notifications';

/**
 * The bell, pushed rather than asked for.
 *
 * This is the upgrade `README.md` names beside the tracking poll: **the Next
 * server holds the upstream WebSocket and streams it down as Server-Sent
 * Events.** The browser cannot hold that socket itself — the gateway
 * authenticates in its first message and the session is an httpOnly cookie the
 * page cannot read — but this request *does* carry the cookie, so the bridge
 * can be built here and nowhere else.
 *
 * SSE downward rather than a second WebSocket: everything travels one way (the
 * server tells, the browser listens), `EventSource` reconnects on its own, and
 * it is plain HTTP, so it needs no upgrade path through whatever sits in front
 * of this app.
 *
 * **What it costs**, and the README says so: one held connection per open tab,
 * on both sides of this server. That is a deployment decision — a serverless
 * host that bills wall-clock or caps request duration will want the 30-second
 * poll in `notifications/route.ts` instead, which is still there and still the
 * fallback whenever this stream cannot be opened.
 */
export const dynamic = 'force-dynamic';
/** Explicit: the Edge runtime has no `ws`-style client this can bridge with. */
export const runtime = 'nodejs';

/**
 * A comment line every 25 seconds.
 *
 * Ignored by `EventSource`, but it keeps the connection from looking idle to a
 * proxy — nginx closes a silent upstream at 60s by default, and an order that
 * takes twenty minutes to cook is exactly the case this stream exists for.
 */
const HEARTBEAT_MS = 25_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lang: string }> },
): Promise<Response> {
  const { lang } = await params;
  if (!parseLanguage(lang)) {
    return new NextResponse(null, { status: 404 });
  }

  // Reads the bell *and* proves the token, which is what the socket needs: the
  // gateway checks it once, at subscribe time, so it has to be good then. A
  // rotated one is written back to the cookie here — before the stream starts,
  // which is the only moment a route handler may still set a header.
  let opened: Awaited<ReturnType<typeof bellWithToken>>;
  try {
    opened = await bellWithToken();
  } catch (error) {
    // A refresh token the API will not take — it was already spent, or the
    // session was revoked. That is a session that ended, so it has to answer
    // **401 like the sibling route**, not 500: `EventSource` gives up
    // permanently on a non-stream response, which is exactly right here, while
    // a 500 would have it reconnecting forever against a session that is never
    // coming back. Anything else is a real fault and still throws.
    if (error instanceof ApiError) {
      return new NextResponse(null, { status: error.status === 401 ? 401 : error.status });
    }
    throw error;
  }

  if (!opened) {
    return new NextResponse(null, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      // Declared before `shutdown` closes over it, so the reader never has to
      // work out whether the assignment below happens first.
      let socket: WebSocket | null = null;

      const send = (event: string, data: unknown): void => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away between the check and the write. Nothing to
          // do — the abort handler below is what tidies up.
        }
      };

      const shutdown = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
        }
        try {
          socket?.close();
        } catch {
          // Already closing.
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      // The bell as it stands, first — so a tab that just opened, or one whose
      // stream dropped and reconnected, is current immediately rather than
      // after the next thing happens to it.
      send('bell', opened.bell);

      socket = new WebSocket(apiWsUrl('/orders/stream'));
      const upstream = socket;

      upstream.onopen = () => {
        upstream.send(JSON.stringify({ event: 'watchMe', data: { token: opened.accessToken } }));
      };

      upstream.onmessage = (message: MessageEvent) => {
        let frame: { event?: string; data?: unknown };
        try {
          frame = JSON.parse(String(message.data)) as { event?: string; data?: unknown };
        } catch {
          return;
        }
        if (frame.event === 'notification') {
          send('notification', frame.data);
        }
        if (frame.event === 'error') {
          // A refused subscription — a token that expired between the read
          // above and this message, or a guest. Ending the stream is the right
          // answer rather than holding a socket that will never say anything:
          // `EventSource` reconnects, and the next attempt reads the cookie
          // again and refreshes it.
          shutdown();
        }
      };

      upstream.onclose = () => shutdown();
      upstream.onerror = () => shutdown();

      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            shutdown();
          }
        }
      }, HEARTBEAT_MS);

      // The tab closed, or navigated. Without this the upstream socket would
      // outlive the reader it was opened for — one leak per page view.
      request.signal.addEventListener('abort', shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Tells nginx not to buffer this response; without it the proxy holds
      // each event until its buffer fills, which for a bell is forever.
      'x-accel-buffering': 'no',
    },
  });
}
