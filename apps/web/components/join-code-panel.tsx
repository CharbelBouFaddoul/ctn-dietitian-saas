"use client";

import { useState } from "react";
import { Button, Section, StatusBadge } from "@nutrition-saas/ui";
import { portalStatusLabel } from "../lib/practice-labels";

export function JoinCodePanel({
  title,
  description,
  connectionStatus,
  plainJoinCode,
  hint,
  expiresAt,
  allowManage,
  portalBusy,
  disconnectRequestedAt,
  disconnectRequestNote,
  onGenerate,
  onCopy,
  onRevoke,
  onDeactivate,
  onDismissDisconnectRequest,
}: {
  title: string;
  description: string;
  connectionStatus: string | null | undefined;
  plainJoinCode: string | null;
  hint: string | null;
  expiresAt: string | null;
  allowManage: boolean;
  portalBusy: boolean;
  disconnectRequestedAt?: string | null;
  disconnectRequestNote?: string | null;
  onGenerate: () => void;
  onCopy: () => void;
  onRevoke: () => void;
  onDeactivate?: () => void;
  onDismissDisconnectRequest?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const connected = connectionStatus === "connected";
  const waiting = Boolean(plainJoinCode || hint);
  const leaveRequested = Boolean(disconnectRequestedAt);

  async function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Section title={title}>
      <p className="ui-muted">{description}</p>

      {leaveRequested ? (
        <div
          className="ui-alert ui-alert--warning"
          style={{ marginTop: 12 }}
          role="status"
        >
          <strong>Patient asked to leave this clinic</strong>
          <p className="ui-muted" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
            {disconnectRequestNote?.trim()
              ? `Note: “${disconnectRequestNote.trim()}”. `
              : null}
            Deactivate portal to approve, or dismiss to keep them connected.
            {disconnectRequestedAt
              ? ` Requested ${new Date(disconnectRequestedAt).toLocaleString()}.`
              : null}
          </p>
        </div>
      ) : null}

      <div className="ui-client-chart__toolbar" style={{ margin: "12px 0 8px" }}>
        <span className="ui-muted" style={{ fontSize: "0.875rem" }}>
          Status:
        </span>
        <StatusBadge
          status={connectionStatus ?? undefined}
          label={portalStatusLabel(connectionStatus)}
        />
      </div>

      {plainJoinCode ? (
        <div style={{ margin: "12px 0" }}>
          <code
            style={{
              fontFamily: "monospace",
              fontSize: "1.375rem",
              letterSpacing: "0.15em",
              fontWeight: 700,
              background: "var(--color-surface-raised, #f5f5f5)",
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              display: "inline-block",
            }}
          >
            {plainJoinCode}
          </code>
        </div>
      ) : hint ? (
        <p className="ui-muted" style={{ margin: "8px 0" }}>
          Active code ending in <strong>{hint}</strong>
        </p>
      ) : null}

      {expiresAt ? (
        <p className="ui-hint">
          Expires {new Date(expiresAt).toLocaleString()}
        </p>
      ) : null}

      <div className="ui-client-chart__toolbar" style={{ marginTop: 12 }}>
        {allowManage && !connected ? (
          <Button size="sm" variant="secondary" disabled={portalBusy} onClick={onGenerate}>
            {waiting ? "Regenerate join code" : "Generate join code"}
          </Button>
        ) : null}
        {allowManage && plainJoinCode ? (
          <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
            {copied ? "Copied!" : "Copy code"}
          </Button>
        ) : null}
        {allowManage && waiting && !connected ? (
          <Button size="sm" variant="ghost" disabled={portalBusy} onClick={onRevoke}>
            Revoke
          </Button>
        ) : null}
        {onDeactivate ? (
          <Button size="sm" variant="secondary" onClick={onDeactivate}>
            {leaveRequested ? "Approve & deactivate" : "Deactivate portal"}
          </Button>
        ) : null}
        {leaveRequested && onDismissDisconnectRequest ? (
          <Button size="sm" variant="secondary" disabled={portalBusy} onClick={onDismissDisconnectRequest}>
            Dismiss request
          </Button>
        ) : null}
      </div>
    </Section>
  );
}
