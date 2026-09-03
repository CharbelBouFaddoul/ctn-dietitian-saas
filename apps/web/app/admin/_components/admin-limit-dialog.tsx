"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, Field, Input } from "@nutrition-saas/ui";

export function AdminLimitDialog({
  open,
  title,
  description,
  initialValue,
  confirmLabel = "Save",
  pending = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialValue: number;
  confirmLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState(String(initialValue));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(String(initialValue));
      setError(null);
    }
  }, [open, initialValue]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError("Enter a positive number.");
      return;
    }
    onSubmit(parsed);
  }

  return (
    <Dialog open={open} title={title} onClose={onClose} elevated>
      {description ? <p className="ui-muted">{description}</p> : null}
      <form onSubmit={submit} className="ui-stack" style={{ marginTop: 12 }}>
        <Field label="Limit">
          <Input
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </Field>
        {error ? <p className="ui-muted" style={{ color: "var(--color-danger)" }}>{error}</p> : null}
        <div className="ui-row" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
