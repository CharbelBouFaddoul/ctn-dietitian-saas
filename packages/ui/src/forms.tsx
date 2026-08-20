"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useState } from "react";
import { cn } from "./cn";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="ui-field">
      <span className="ui-label">{label}</span>
      {children}
      {hint ? <span className="ui-hint">{hint}</span> : null}
      {error ? <span className="ui-error">{error}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("ui-textarea", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("ui-select", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="ui-check">
      <input type="checkbox" className={className} {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="ui-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="ui-switch"
        data-on={checked}
        onClick={() => onCheckedChange(!checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="ui-input-wrap">
      <input className={cn("ui-input", className)} type={visible ? "text" : "password"} {...props} />
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setVisible((v) => !v)}>
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
