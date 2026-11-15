"use client";

import type { ReactNode } from "react";

/**
 * One option in a radio group: a real radio input (arrow keys, screen readers)
 * dressed as the app's pressable choice card.
 */
export function Choice({
  name,
  value,
  checked,
  onSelect,
  title,
  sub,
  compact = false,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: ReactNode;
  sub?: ReactNode;
  compact?: boolean;
}) {
  return (
    <label
      data-checked={checked}
      className={`choice cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-[checked=true]:border-brand data-[checked=true]:bg-brand-light data-[checked=true]:text-brand-dark data-[checked=true]:[--lip:var(--color-brand)] ${
        compact ? "min-h-12 py-2" : ""
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span>{title}</span>
        {sub && <span className="mt-0.5 text-sm font-semibold text-muted">{sub}</span>}
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-brand bg-brand" : "border-line-strong"
        }`}
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}
