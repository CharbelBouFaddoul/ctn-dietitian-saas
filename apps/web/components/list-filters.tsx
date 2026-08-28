"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export const LIST_SEARCH_DEBOUNCE_MS = 280;

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function FilterPopover({
  label,
  value,
  active = false,
  items,
  searchPlaceholder,
  onSelect,
  children,
}: {
  label: string;
  value: string;
  active?: boolean;
  items?: Array<{ id: string; label: string; active?: boolean }>;
  searchPlaceholder?: string;
  onSelect?: (id: string) => void;
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = Boolean(items);

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

  const needle = query.trim().toLowerCase();
  const visibleItems =
    items?.filter((item) => !needle || item.label.toLowerCase().includes(needle)) ?? [];

  function close() {
    setOpen(false);
  }

  return (
    <div className="ui-list-filters__cell" ref={rootRef}>
      <button
        type="button"
        className={`ui-list-filters__trigger${active ? " is-set" : ""}${open ? " is-open" : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
      </button>
      {open ? (
        <div className="ui-list-filters__menu" role="listbox" aria-label={label}>
          {searchable ? (
            <>
              <label className="ui-list-filters__menu-search">
                <SearchIcon />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder ?? "Search"}
                  aria-label={searchPlaceholder ?? `Search ${label}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
              <div className="ui-list-filters__menu-list">
                {visibleItems.length === 0 ? (
                  <p className="ui-list-filters__empty">No matches</p>
                ) : (
                  visibleItems.map((item) => (
                    <button
                      key={item.id || "all"}
                      type="button"
                      className={`ui-list-filters__option${item.active ? " is-active" : ""}`}
                      onClick={() => {
                        onSelect?.(item.id);
                        close();
                      }}
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="ui-list-filters__menu-list">{children?.(close)}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ListFilters({
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  hasFilters = false,
  onClear,
  count,
  countNoun,
  loading = false,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel?: string;
  hasFilters?: boolean;
  onClear?: () => void;
  count?: number;
  countNoun: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const noun = count === 1 ? countNoun : `${countNoun}s`;
  const filters = Children.toArray(children).filter(Boolean);

  return (
    <div className="ui-list-filters">
      <div className="ui-list-filters__bar">
        <label className="ui-list-filters__search">
          <SearchIcon />
          <input
            className="ui-list-filters__query"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel ?? searchPlaceholder}
          />
        </label>
        {filters.length > 0 ? <div className="ui-list-filters__group">{filters}</div> : null}
        {hasFilters && onClear ? (
          <button type="button" className="ui-list-filters__clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
        <p className="ui-list-filters__count">
          {loading ? (
            "Loading"
          ) : (
            <>
              <strong>{count ?? 0}</strong>
              <span>{noun}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function ListPager({
  page,
  pageCount,
  loading = false,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="ui-list-pager">
      <p>
        Page {page} of {pageCount}
      </p>
      <div className="ui-list-pager__actions">
        <button
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--sm"
          disabled={page <= 1 || loading}
          onClick={onPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--sm"
          disabled={page >= pageCount || loading}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
