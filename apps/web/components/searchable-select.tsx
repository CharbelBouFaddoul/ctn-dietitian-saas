"use client";

import { useEffect, useRef, useState } from "react";

export type SearchableSelectOption = {
  id: string;
  label: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search",
  emptyLabel = "No matches",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value);
  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) => !needle || option.label.toLowerCase().includes(needle));

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <div className={`ui-search-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`ui-search-select__trigger${selected ? " is-set" : ""}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
      </button>
      {open && !disabled ? (
        <div className="ui-search-select__menu" role="listbox" aria-label={ariaLabel ?? placeholder}>
          <label className="ui-search-select__search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </label>
          <div className="ui-search-select__list">
            {visible.length === 0 ? (
              <p className="ui-search-select__empty">{emptyLabel}</p>
            ) : (
              visible.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={`ui-search-select__option${option.id === value ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
