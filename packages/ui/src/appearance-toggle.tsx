"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import {
  APPEARANCE_CHANGE_EVENT,
  applyAppearance,
  readAppearancePreference,
  resolveAppearance,
  subscribeSystemAppearance,
  writeAppearancePreference,
  type AppearancePreference,
} from "./appearance";

const OPTIONS: Array<{ id: AppearancePreference; label: string; hint: string }> = [
  { id: "light", label: "Light", hint: "Light appearance" },
  { id: "dark", label: "Dark", hint: "Dark appearance" },
  { id: "system", label: "System", hint: "Match system appearance" },
];

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M3 12h2.2M18.8 12H21M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.4 13.6A6.4 6.4 0 0 1 10.4 4.2 7.2 7.2 0 1 0 19.8 13.6a6.3 6.3 0 0 1-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 19.5h8M12 16.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OptionIcon({ id }: { id: AppearancePreference }) {
  if (id === "dark") return <MoonIcon />;
  if (id === "system") return <SystemIcon />;
  return <SunIcon />;
}

export function useAppearance() {
  const [preference, setPreference] = useState<AppearancePreference>("system");

  useEffect(() => {
    const stored = readAppearancePreference();
    setPreference(stored);
    applyAppearance(resolveAppearance(stored));

    function onCustom(event: Event) {
      const next = (event as CustomEvent<AppearancePreference>).detail;
      if (next === "light" || next === "dark" || next === "system") setPreference(next);
    }
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onCustom);
    const stopSystem = subscribeSystemAppearance(() => {
      const current = readAppearancePreference();
      if (current === "system") applyAppearance(resolveAppearance(current));
    });
    return () => {
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, onCustom);
      stopSystem();
    };
  }, []);

  function setAppearance(next: AppearancePreference) {
    setPreference(next);
    writeAppearancePreference(next);
  }

  return { preference, setAppearance, resolved: resolveAppearance(preference) };
}

export function AppearanceToggle({
  compact = false,
  variant = "segmented",
}: {
  compact?: boolean;
  variant?: "segmented" | "menu";
}) {
  const { preference, setAppearance, resolved } = useAppearance();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  if (variant === "menu") {
    return (
      <div className="ui-appearance-menu" ref={rootRef}>
        <button
          type="button"
          className="ui-appearance-menu__btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Change appearance"
          title="Change appearance"
          onClick={() => setOpen((value) => !value)}
        >
          <OptionIcon id={resolved === "dark" ? "dark" : "light"} />
        </button>
        {open ? (
          <div className="ui-appearance-menu__pop" role="menu" aria-label="Appearance">
            {OPTIONS.map((option) => {
              const active = preference === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={cn("ui-appearance-menu__opt", active && "is-active")}
                  onClick={() => {
                    setAppearance(option.id);
                    setOpen(false);
                  }}
                >
                  <OptionIcon id={option.id} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn("ui-appearance", compact && "ui-appearance--compact")}
      role="group"
      aria-label="Appearance"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={cn("ui-appearance__opt", active && "is-active")}
            aria-pressed={active}
            aria-label={option.hint}
            title={option.hint}
            onClick={() => setAppearance(option.id)}
          >
            <OptionIcon id={option.id} />
            <span className="ui-appearance__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
