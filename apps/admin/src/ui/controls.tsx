import type { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useT } from '../i18n';
import { Icon } from './icons';
import { cx } from './core';

/**
 * Controls that carry a value.
 *
 * All three are Radix underneath, which is the point of the redesign: a native
 * `<select>` cannot be styled into the panel's surface without breaking its
 * keyboard behaviour, and a `<button>` pretending to be a switch has to
 * re-implement roles, arrow keys and focus management by hand. Radix owns the
 * behaviour; this file owns the appearance, and the appearance is only tokens.
 */

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Second line inside the dropdown — context that does not fit the label. */
  hint?: string;
}

/**
 * A listbox that looks like the rest of the panel.
 *
 * An empty `value` is how the "choose one…" state is expressed: Radix shows the
 * placeholder for it while the component stays controlled. Option values
 * themselves must be non-empty.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  disabled = false,
  ariaLabel,
  className,
}: {
  value: T | '';
  onValueChange: (value: T) => void;
  options: readonly Option<T>[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cx('select', className)}
        aria-label={ariaLabel}
      >
        <SelectPrimitive.Value placeholder={placeholder ?? t('selectPlaceholder')} />
        <SelectPrimitive.Icon className="select__chevron">
          <Icon name="chevronDown" size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="popover select__content" position="popper" sideOffset={6}>
          <SelectPrimitive.ScrollUpButton className="select__scroll">
            <Icon name="chevronUp" size={14} />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="select__viewport">
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className="select__item">
                <span className="select__item-text">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.hint !== undefined && <span className="select__item-hint">{option.hint}</span>}
                </span>
                <SelectPrimitive.ItemIndicator className="select__check">
                  <Icon name="check" size={15} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="select__scroll">
            <Icon name="chevronDown" size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/**
 * On/off for the things a shift flips all day — a branch taking orders, a dish
 * being available.
 *
 * A switch rather than a button whose label flips between "Open" and "Close":
 * that phrasing never says whether it reports the state or the action, and
 * getting it wrong on a live kitchen is expensive.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      className="switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <SwitchPrimitive.Thumb className="switch__thumb" />
    </SwitchPrimitive.Root>
  );
}

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Rendered as a pill on the segment — the size of what it filters to. */
  count?: number;
}

/**
 * The filter strip above a list, with the list itself as the panel.
 *
 * Built on Radix Tabs rather than a row of buttons so the whole strip is one
 * tab stop and arrow keys move between segments — the difference between
 * filtering a board by keyboard and tabbing through every option to reach the
 * list.
 */
export function SegmentedTabs<T extends string>({
  value,
  onValueChange,
  segments,
  label,
  children,
  actions,
}: {
  value: T;
  onValueChange: (value: T) => void;
  segments: readonly Segment<T>[];
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <div className="segmented-row">
        <TabsPrimitive.List className="segmented" aria-label={label}>
          {segments.map((segment) => (
            <TabsPrimitive.Trigger key={segment.value} value={segment.value} className="segmented__item">
              {segment.label}
              {segment.count !== undefined && <span className="segmented__count">{segment.count}</span>}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {actions}
      </div>

      {segments.map((segment) => (
        <TabsPrimitive.Content key={segment.value} value={segment.value} className="segmented__panel">
          {segment.value === value ? children : null}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
