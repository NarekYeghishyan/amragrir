import type { NextFunction, Request, Response } from 'express';

/**
 * A request whose body was read as bytes rather than parsed as JSON.
 *
 * `rawBody` is absent when nothing was sent, or when what was sent went past
 * the limit — `tooLarge` tells those two apart, because "you sent nothing" and
 * "you sent 40 MB" deserve different answers.
 */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
  rawBodyTooLarge?: boolean;
}

/**
 * Collects the request body into a Buffer.
 *
 * An upload is one file, sent as the raw body under its own `Content-Type` —
 * not multipart. That choice is what keeps this to twenty lines and no new
 * dependency: multipart would mean multer, which needs `@types/multer` to
 * compile and brings a parser, temp files and a disk-storage engine to move
 * exactly one image per request. `fetch(url, { body: file })` from the panel is
 * the whole client side of it.
 *
 * Nest's global JSON parser runs first and ignores an `image/*` body, so the
 * stream is still unread by the time this sees it.
 *
 * Over the limit, the body is drained but not kept: stopping mid-stream leaves
 * the socket holding data nobody will read, which some clients wait on until
 * they time out. Reading a few megabytes into nothing is the cheaper end of
 * that trade — the ceiling in `uploads.ts` is what a request is actually
 * allowed to *store*.
 */
export function collectRawBody(limitBytes: number) {
  return (req: RawBodyRequest, _res: Response, next: NextFunction): void => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      req.rawBodyTooLarge = tooLarge;
      req.rawBody = tooLarge || chunks.length === 0 ? undefined : Buffer.concat(chunks);
      next();
    });

    req.on('error', (error) => next(error));
  };
}
