"use client";

import type { FormEvent, ReactNode } from "react";

export function AdminListToolbar({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="ui-admin-toolbar">
      {children}
    </form>
  );
}
