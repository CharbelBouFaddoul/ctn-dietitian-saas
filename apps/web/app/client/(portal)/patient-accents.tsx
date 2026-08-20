import type { ReactNode } from "react";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PatientAccents = {
  food: (
    <Glyph>
      <path d="M12 3v18" />
      <path d="M8 7c0-2 1.5-4 4-4s4 2 4 4v4H8V7z" />
      <path d="M7 11h10v2a5 5 0 0 1-10 0v-2z" />
    </Glyph>
  ),
  water: (
    <Glyph>
      <path d="M12 3s5 6 5 10a5 5 0 1 1-10 0c0-4 5-10 5-10z" />
    </Glyph>
  ),
  exercise: (
    <Glyph>
      <path d="M6.5 9.5 4 12l2.5 2.5M17.5 9.5 20 12l-2.5 2.5" />
      <path d="M9 12h6" />
      <path d="M8 7v10M16 7v10" />
    </Glyph>
  ),
  sleep: (
    <Glyph>
      <path d="M21 14.5A7.5 7.5 0 1 1 12.5 4 6 6 0 0 0 21 14.5z" />
    </Glyph>
  ),
  habits: (
    <Glyph>
      <path d="M9 11.5 11 13.5 15.5 9" />
      <circle cx="12" cy="12" r="9" />
    </Glyph>
  ),
  plan: (
    <Glyph>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Glyph>
  ),
  messages: (
    <Glyph>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Glyph>
  ),
  documents: (
    <Glyph>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Glyph>
  ),
  invoices: (
    <Glyph>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </Glyph>
  ),
} as const;

export type PatientTone = keyof typeof PatientAccents;
