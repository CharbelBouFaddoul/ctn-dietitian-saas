"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input, Textarea } from "@nutrition-saas/ui";

export type InsertToken = { friendly: string; label: string };

export function TemplateInsertField({
  label,
  value,
  onChange,
  multiline,
  tokens,
  className,
  rows = 8,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  tokens: InsertToken[];
  className?: string;
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const caret = useRef({ start: 0, end: 0 });
  const fieldId = label.replace(/\s+/g, "-").toLowerCase();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target?.closest?.(".ui-automation-insert-wrap")) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function remember(el: HTMLInputElement | HTMLTextAreaElement) {
    caret.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }

  function insert(token: string) {
    const start = caret.current.start;
    const end = caret.current.end;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    caret.current = { start: start + token.length, end: start + token.length };
    setOpen(false);
  }

  const tokenProps = {
    "data-token-field": fieldId,
    onSelect: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => remember(event.currentTarget),
    onKeyUp: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => remember(event.currentTarget),
    onMouseUp: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => remember(event.currentTarget),
    onBlur: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => remember(event.currentTarget),
  };

  const control: ReactNode = multiline ? (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      rows={rows}
      {...tokenProps}
    />
  ) : (
    <Input value={value} onChange={(event) => onChange(event.target.value)} {...tokenProps} />
  );

  return (
    <div className="ui-field ui-automation-insert-wrap">
      <div className="ui-automation-insert__bar">
        <span className="ui-label">{label}</span>
        <button
          type="button"
          className={`ui-automation-insert__btn${open ? " is-open" : ""}`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          Insert
        </button>
      </div>
      {control}
      {open ? (
        <div className="ui-automation-insert__menu" role="listbox" onMouseDown={(event) => event.preventDefault()}>
          {tokens.map((token) => (
            <button
              key={token.friendly}
              type="button"
              className="ui-automation-insert__item"
              onClick={() => insert(token.friendly)}
            >
              <strong>{token.label}</strong>
              <span>{token.friendly}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
