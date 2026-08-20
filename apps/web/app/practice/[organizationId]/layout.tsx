"use client";

import type { ReactNode } from "react";
import { PracticeShell } from "./practice-shell";

export default function PracticeLayout({ children }: { children: ReactNode }) {
  return <PracticeShell>{children}</PracticeShell>;
}
