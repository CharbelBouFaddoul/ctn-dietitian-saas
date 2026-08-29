"use client";

import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@nutrition-saas/ui";
import type { ChartPrintAction, ClientPrintDoc } from "./types";

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4v11M8 11.5 12 16l4-4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19.25h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocIcon({ doc }: { doc: ClientPrintDoc }) {
  if (doc === "nutrition-analysis" || doc === "measurement") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M8 15v-4M12 15V8M16 15v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (doc === "tracking") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (doc === "assessments") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4h8l4 4v12H8V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M16 4v4h4M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15 3v5h4M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function printHref(dietitianAccountId: string, clientId: string, doc: string) {
  return `/practice/${dietitianAccountId}/clients/${clientId}/print?doc=${doc}`;
}

export function ChartPrintControl({
  dietitianAccountId,
  clientId,
  actions,
}: {
  dietitianAccountId: string;
  clientId: string;
  actions: ChartPrintAction[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionKey = actions.map((action) => action.doc).join(",");

  useEffect(() => {
    setOpen(false);
  }, [actionKey]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  if (actions.length === 0) return null;

  const trigger = (
    <button
      type="button"
      className="ui-chart-print-btn"
      aria-label="Download / print PDF"
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={() => setOpen((value) => !value)}
    >
      <DownloadIcon />
    </button>
  );

  return (
    <div className={["ui-chart-print-menu", open ? "is-open" : ""].filter(Boolean).join(" ")} ref={rootRef}>
      {open ? trigger : <Tooltip label="Download / print PDF">{trigger}</Tooltip>}
      {open ? (
        <div className="ui-chart-print-menu__panel" role="menu">
          <p className="ui-chart-print-menu__title">Download / print PDF</p>
          {actions.map((action) => (
            <a
              key={action.doc}
              href={printHref(dietitianAccountId, clientId, action.doc)}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-chart-print-menu__item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="ui-chart-print-menu__icon">
                <DocIcon doc={action.doc} />
              </span>
              <span className="ui-chart-print-menu__copy">
                <span className="ui-chart-print-menu__label">{action.label}</span>
                <span className="ui-chart-print-menu__hint">{action.hint}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
