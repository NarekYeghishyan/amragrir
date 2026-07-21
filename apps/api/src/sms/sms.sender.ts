/**
 * SMS delivery boundary. The provider for Armenia is still an open question
 * (see DEVELOPMENT_GUIDE.md), so the app depends on this interface only —
 * swapping in a real gateway is a one-line provider change in SmsModule.
 */
export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');
