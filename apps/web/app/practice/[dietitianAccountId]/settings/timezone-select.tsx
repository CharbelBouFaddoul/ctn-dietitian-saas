"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterTimezones, groupTimezones, timezoneChoices } from "../../../../lib/timezones";

export function TimezoneSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(value);

  const all = useMemo(() => timezoneChoices(value), [value]);
  const selected = all.find((zone) => zone.id === value);
  const groups = useMemo(() => groupTimezones(filterTimezones(all, query)), [all, query]);
  const flat = useMemo(() => groups.flatMap((group) => group.zones), [groups]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveId(value);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, activeId, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!flat.length) return;
        const current = flat.findIndex((zone) => zone.id === activeId);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = flat[(current + delta + flat.length) % flat.length];
        if (next) setActiveId(next.id);
        return;
      }
      if (event.key === "Enter" && flat.some((zone) => zone.id === activeId)) {
        event.preventDefault();
        onChange(activeId);
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeId, flat, onChange, open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className={`ui-tz-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="ui-tz-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((next) => !next);
        }}
      >
        <span>{selected?.label ?? value.replaceAll("_", " ")}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6.2 8 10l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && !disabled ? (
        <div className="ui-tz-select__panel">
          <div className="ui-tz-select__search">
            <input
              ref={searchRef}
              className="ui-input"
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                const first = filterTimezones(all, next)[0];
                if (first) setActiveId(first.id);
              }}
              placeholder="Search city or region"
              aria-label="Search timezones"
              autoComplete="off"
            />
          </div>
          <div className="ui-tz-select__list" id={listId} role="listbox" aria-label="Timezone">
            {groups.length ? (
              groups.map((group) => (
                <div key={group.region}>
                  <p className="ui-tz-select__region">{group.region}</p>
                  {group.zones.map((zone) => {
                    const active = zone.id === activeId;
                    const on = zone.id === value;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        ref={active ? activeRef : undefined}
                        className={`ui-tz-select__opt${on ? " is-on" : ""}${active ? " is-active" : ""}`}
                        onMouseEnter={() => setActiveId(zone.id)}
                        onClick={() => choose(zone.id)}
                      >
                        {zone.label}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="ui-tz-select__empty">No matching timezone.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
