"use client";

import { FormEvent, useState } from "react";
import { Button, ConfirmDialog, Input } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";

export interface ClinicTag {
  id: string;
  name: string;
  color?: string | null;
}

type Props = {
  dietitianAccountId: string;
  tags: ClinicTag[];
  onChange: (tags: ClinicTag[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function ClinicTagsManager({
  dietitianAccountId,
  tags,
  onChange,
  disabled = false,
  compact = false,
}: Props) {
  const base = `/api/v1/dietitian/${dietitianAccountId}/tags`;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function refresh() {
    const next = await api<ClinicTag[]>(base);
    onChange(next);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: "POST", body: JSON.stringify({ name: trimmed }) });
      setName("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to create tag"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(tagId: string) {
    const trimmed = editName.trim();
    if (!trimmed || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${tagId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to rename tag"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteId || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete tag"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ui-clinic-tags${compact ? " ui-clinic-tags--compact" : ""}`}>
      {error ? <p className="ui-clinic-tags__error">{error}</p> : null}

      <form className="ui-clinic-tags__add" onSubmit={(event) => void handleCreate(event)}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New tag name…"
          maxLength={40}
          aria-label="New tag name"
          disabled={disabled || busy}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={disabled || busy || !name.trim()}
        >
          Add
        </Button>
      </form>

      {tags.length === 0 ? (
        <p className="ui-muted ui-clinic-tags__empty">No clinic tags yet. Add one above.</p>
      ) : (
        <ul className="ui-clinic-tags__list">
          {tags.map((tag) => (
            <li key={tag.id} className="ui-clinic-tags__row">
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={40}
                    aria-label={`Rename ${tag.name}`}
                    disabled={disabled || busy}
                    autoFocus
                  />
                  <div className="ui-clinic-tags__row-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={disabled || busy || !editName.trim()}
                      onClick={() => void handleRename(tag.id)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="ui-clinic-tags__name">{tag.name}</span>
                  <div className="ui-clinic-tags__row-actions">
                    <button
                      type="button"
                      className="ui-clinic-tags__link"
                      disabled={disabled || busy}
                      onClick={() => {
                        setEditingId(tag.id);
                        setEditName(tag.name);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ui-clinic-tags__link"
                      disabled={disabled || busy}
                      onClick={() => setDeleteId(tag.id)}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Remove this tag?"
        description="It will be removed from your clinic library and from every client who has it."
        confirmLabel="Remove tag"
        pending={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
