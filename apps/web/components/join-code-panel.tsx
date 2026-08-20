"use client";

import { Button, Card } from "@nutrition-saas/ui";
import { connectionStatusLabel } from "../lib/connection-status";

export function JoinCodePanel({
  title,
  description,
  connectionStatus,
  plainJoinCode,
  hint,
  expiresAt,
  allowManage,
  portalBusy,
  onGenerate,
  onCopy,
  onRevoke,
  onDeactivate,
}: {
  title: string;
  description: string;
  connectionStatus: string | null | undefined;
  plainJoinCode: string | null;
  hint: string | null;
  expiresAt: string | null;
  allowManage: boolean;
  portalBusy: boolean;
  onGenerate: () => void;
  onCopy: () => void;
  onRevoke: () => void;
  onDeactivate?: () => void;
}) {
  const connected = connectionStatus === "connected";
  const waiting = Boolean(plainJoinCode || hint);
  return (
    <Card title={title}>
      <p className="ui-muted">{description}</p>
      <p>
        Status: <strong>{connectionStatusLabel(connectionStatus)}</strong>
      </p>
      {plainJoinCode ? <p className="ui-code">{plainJoinCode}</p> : null}
      {!plainJoinCode && hint ? (
        <p>
          Code ending in <strong>{hint}</strong>
        </p>
      ) : null}
      {expiresAt ? <p className="ui-muted">Expires {new Date(expiresAt).toLocaleString()}</p> : null}
      <div className="ui-row">
        {allowManage && !connected ? (
          <Button disabled={portalBusy} onClick={onGenerate}>
            {waiting ? "Regenerate join code" : "Generate join code"}
          </Button>
        ) : null}
        {allowManage && plainJoinCode ? (
          <Button variant="secondary" onClick={onCopy}>
            Copy
          </Button>
        ) : null}
        {allowManage && waiting && !connected ? (
          <Button variant="danger" disabled={portalBusy} onClick={onRevoke}>
            Revoke
          </Button>
        ) : null}
        {onDeactivate ? (
          <Button variant="danger" onClick={onDeactivate}>
            Deactivate portal
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
