/**
 * Email delivery boundary, deliberately the same shape as `SmsSender`.
 *
 * No provider is chosen yet, so the app depends on this interface only —
 * swapping in a real one is a `useClass` change in EmailModule. Staff sign-in
 * depends on delivery working, which is why this is an interface with a
 * console implementation rather than a direct SDK call somewhere in a service.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. HTML can be added when a provider is chosen; nothing in the
   *  staff flows needs it, and a link that must be pasted into a browser is
   *  more robust than one that must be clicked. */
  body: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
