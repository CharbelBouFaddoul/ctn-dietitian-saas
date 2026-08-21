"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";

interface DietitianOption {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerEmail?: string | null;
}

export function DietitianSearchSelect({
  value,
  onChange,
  required,
  placeholder = "Search by practice name or owner email…",
}: {
  value: string;
  onChange: (dietitianAccountId: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<DietitianOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }
    if (selectedLabel) return;
    void api<DietitianOption>(`/api/v1/admin/dietitians/${value}`)
      .then((row) => {
        setSelectedLabel(formatOption(row));
        setQuery(formatOption(row));
      })
      .catch(() => undefined);
  }, [value, selectedLabel]);

  useEffect(() => {
    if (!open) return;

    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const path = query.trim()
            ? `/api/v1/admin/dietitians?q=${encodeURIComponent(query.trim())}`
            : "/api/v1/admin/dietitians";
          const rows = await api<DietitianOption[]>(path);
          setOptions(rows.filter((row) => row.status === "ACTIVE"));
        } catch {
          setOptions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [open, query]);

  function formatOption(row: Pick<DietitianOption, "name" | "ownerEmail" | "slug">) {
    if (row.ownerEmail) return `${row.name} (${row.ownerEmail})`;
    return row.name || row.slug;
  }

  function selectOption(row: DietitianOption) {
    const label = formatOption(row);
    onChange(row.id);
    setSelectedLabel(label);
    setQuery(label);
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setSelectedLabel("");
    setQuery("");
    setOpen(true);
  }

  return (
    <div ref={rootRef} className="ui-dietitian-search" style={{ position: "relative" }}>
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        required={required && !value}
        placeholder={placeholder}
        autoComplete="off"
        style={value ? { paddingRight: 72 } : undefined}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (value && next !== selectedLabel) {
            onChange("");
            setSelectedLabel("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          style={{ position: "absolute", right: 6, top: 6 }}
          onClick={clearSelection}
        >
          Clear
        </button>
      ) : null}

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="ui-dropdown__menu"
          style={{ left: 0, right: 0, maxHeight: 240, overflowY: "auto", zIndex: 30 }}
        >
          {loading ? <div className="ui-dropdown__item ui-muted">Searching…</div> : null}
          {!loading && options.length === 0 ? (
            <div className="ui-dropdown__item ui-muted">
              {query.trim() ? "No matching practices." : "Type to search practices."}
            </div>
          ) : null}
          {!loading
            ? options.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={row.id === value}
                  className="ui-dropdown__item"
                  onClick={() => selectOption(row)}
                >
                  <strong style={{ display: "block" }}>{row.name}</strong>
                  <span className="ui-muted" style={{ fontSize: 12 }}>
                    {row.ownerEmail || row.slug}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}

      <input type="hidden" value={value} required={required} readOnly />
    </div>
  );
}
