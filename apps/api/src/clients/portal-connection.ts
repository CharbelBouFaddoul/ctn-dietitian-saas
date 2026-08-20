export type ConnectionStatus = "not_connected" | "waiting" | "expired" | "connected" | "deactivated";

export function deriveConnectionStatus(
  account: { status: string } | null | undefined,
  openInvite: { expiresAt: Date } | null | undefined,
): ConnectionStatus {
  if (account?.status === "ACTIVE") {
    return "connected";
  }
  if (account?.status === "DEACTIVATED") {
    return "deactivated";
  }
  if (openInvite) {
    return openInvite.expiresAt.getTime() > Date.now() ? "waiting" : "expired";
  }
  return "not_connected";
}
