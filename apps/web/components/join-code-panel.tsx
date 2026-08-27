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
    <Section
      className="ui-client-settings__card"
      title={title}
      description={description}
      actions={
        <StatusBadge
          status={connectionStatus ?? undefined}
          label={portalStatusLabel(connectionStatus)}
        />
      }
    >
      {leaveRequested ? (
        <div className="ui-alert ui-alert--warning ui-client-settings__alert" role="status">
          <strong>Patient asked to leave this clinic</strong>
          <p className="ui-muted">
            {disconnectRequestNote?.trim() ? `Note: “${disconnectRequestNote.trim()}”. ` : null}
            Deactivate portal to approve, or dismiss to keep them connected.
            {disconnectRequestedAt
              ? ` Requested ${new Date(disconnectRequestedAt).toLocaleString()}.`
              : null}
          </p>
        </div>
      ) : null}

      {plainJoinCode ? (
        <div className="ui-client-settings__code">
          <div>
            <p className="ui-client-settings__kicker">Join code</p>
            <code className="ui-client-settings__code-value">{plainJoinCode}</code>
            {expiresAt ? (
              <p className="ui-hint">Expires {new Date(expiresAt).toLocaleString()}</p>
            ) : null}
          </div>
          {allowManage ? (
            <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
              {copied ? "Copied" : "Copy code"}
            </Button>
          ) : null}
        </div>
      ) : waiting ? (
        <div className="ui-client-settings__note">
          <p>
            A join code ending in <strong>{hint}</strong> is still active.
            {expiresAt ? ` Expires ${new Date(expiresAt).toLocaleString()}.` : null}
          </p>
        </div>
      ) : connected ? (
        <ul className="ui-client-settings__facts">
          <li>This patient can sign in to the app and see their plan.</li>
          <li>Deactivating signs them out and turns portal access off.</li>
        </ul>
      ) : (
        <ul className="ui-client-settings__facts">
          <li>You can keep working in this chart without them signing in.</li>
          <li>When they are ready, generate a code so they can create an account and connect.</li>
        </ul>
      )}

      {allowManage ? (
        <div className="ui-client-settings__actions">
          {!connected ? (
            <Button size="sm" disabled={portalBusy} onClick={onGenerate}>
              {waiting ? "Regenerate join code" : "Generate join code"}
            </Button>
          ) : null}
          {waiting && !connected ? (
            <Button size="sm" variant="ghost" disabled={portalBusy} onClick={onRevoke}>
              Revoke code
            </Button>
          ) : null}
          {onDeactivate ? (
            <Button size="sm" variant={leaveRequested ? "danger" : "secondary"} onClick={onDeactivate}>
              {leaveRequested ? "Approve & deactivate" : "Deactivate portal"}
            </Button>
          ) : null}
          {leaveRequested && onDismissDisconnectRequest ? (
            <Button size="sm" variant="ghost" disabled={portalBusy} onClick={onDismissDisconnectRequest}>
              Dismiss request
            </Button>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
