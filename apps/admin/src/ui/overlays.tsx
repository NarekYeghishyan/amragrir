import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { useT } from '../i18n';
import { Icon, type IconName } from './icons';
import { Button, IconButton, cx, type Tone } from './core';

/**
 * Everything that opens over the page.
 *
 * These are the wrappers worth having: focus trapping, restoring focus to the
 * trigger on close, `Escape`, scroll locking, `aria-modal`, and the pointer
 * rules that keep a menu from closing when the mouse crosses a gap. Each is a
 * day of work to get right by hand and a permanent bug source afterwards —
 * Radix already has them, so the panel only decides how they look.
 */

// ── dialog ──────────────────────────────────────────────────────────────────

/**
 * A form that would otherwise unfold inside the list it is about.
 *
 * The old panel toggled inline forms open, which pushed the list down and left
 * "add a dish" and the dish it was above competing for the same space. A dialog
 * puts the task in front and gives the list back untouched when it closes.
 */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  wide = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger !== undefined && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="overlay" />
        <DialogPrimitive.Content
          className={cx('dialog', wide && 'dialog--wide')}
          // Radix points `aria-describedby` at a description id by default.
          // With no <Description> rendered, that id matches nothing — so the
          // attribute is cleared for those dialogs, which is Radix's own
          // opt-out. Spread rather than passed directly: when a description
          // *is* rendered, the default has to survive untouched.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className="dialog__head">
            <div>
              <DialogPrimitive.Title className="dialog__title">{title}</DialogPrimitive.Title>
              {description !== undefined && (
                <DialogPrimitive.Description className="dialog__desc">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton icon="close" label={t('actionClose')} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogBody({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('dialog__body', className)} {...rest}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('dialog__foot', className)} {...rest}>
      {children}
    </div>
  );
}

export const DialogClose = DialogPrimitive.Close;

// ── confirm ─────────────────────────────────────────────────────────────────

/**
 * The gate in front of anything that cannot be undone from this panel.
 *
 * An alert dialog rather than a plain one: it takes focus to the safe choice
 * and refuses to close on a click outside, because deleting a dish or removing
 * somebody's role should not be one stray click away.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <AlertDialogPrimitive.Root>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="overlay" />
        <AlertDialogPrimitive.Content className="dialog dialog--confirm">
          <AlertDialogPrimitive.Title className="dialog__title">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="dialog__desc">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="dialog__foot">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost">{t('actionCancel')}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ── dropdown menu ───────────────────────────────────────────────────────────

export function Menu({
  trigger,
  children,
  align = 'end',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content className="popover menu" align={align} sideOffset={8}>
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function MenuItem({
  icon,
  tone = 'neutral',
  onSelect,
  children,
}: {
  icon?: IconName;
  tone?: 'neutral' | 'danger';
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cx('menu__item', tone === 'danger' && 'menu__item--danger')}
      onSelect={onSelect}
    >
      {icon !== undefined && <Icon name={icon} size={16} />}
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenuPrimitive.Label className="menu__label">{children}</DropdownMenuPrimitive.Label>;
}

/**
 * A set of mutually exclusive choices inside a menu — the language picker.
 *
 * A radio group rather than three plain items so the current choice is
 * announced as chosen rather than merely ticked, and so arrow keys move through
 * it as one control.
 */
export function MenuRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </DropdownMenuPrimitive.RadioGroup>
  );
}

export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.RadioItem className="menu__item" value={value}>
      <span className="menu__check">
        <DropdownMenuPrimitive.ItemIndicator>
          <Icon name="check" size={15} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="menu__sep" />;
}

// ── tooltip ─────────────────────────────────────────────────────────────────

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * Hover/focus help for a control whose label had to be short.
 *
 * Never the only place something is said — a tooltip is unreachable on a touch
 * screen and invisible to anyone scanning, so what it holds is always an aside.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="tooltip" sideOffset={6}>
          {label}
          <TooltipPrimitive.Arrow className="tooltip__arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ── toast ───────────────────────────────────────────────────────────────────

interface ToastMessage {
  id: number;
  tone: Extract<Tone, 'good' | 'danger' | 'neutral'>;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Transient feedback for actions.
 *
 * Replaces the per-screen `result`/`error` paragraphs the old panel kept in
 * component state: those appeared next to the form that caused them, which is
 * often not where the eye is after a click, and they stayed until the next
 * action rewrote them. Failures live longer than successes here — one is read
 * and dismissed, the other has to be acted on.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const t = useT();

  const push = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = nextId.current++;
    setMessages((current) => [...current, { id, tone, text }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => push('good', text),
      error: (text) => push('danger', text),
      info: (text) => push('neutral', text),
    }),
    [push],
  );

  const dismiss = (id: number): void =>
    setMessages((current) => current.filter((message) => message.id !== id));

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {messages.map((message) => (
          <ToastPrimitive.Root
            key={message.id}
            className={cx('toast', `toast--${message.tone}`)}
            duration={message.tone === 'danger' ? 8000 : 4000}
            onOpenChange={(open) => {
              if (!open) {
                dismiss(message.id);
              }
            }}
          >
            <Icon
              name={message.tone === 'danger' ? 'warning' : 'check'}
              size={17}
              className="toast__icon"
            />
            <ToastPrimitive.Title className="toast__title">{message.text}</ToastPrimitive.Title>
            <ToastPrimitive.Close asChild>
              <IconButton icon="close" label={t('actionDismiss')} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return api;
}
