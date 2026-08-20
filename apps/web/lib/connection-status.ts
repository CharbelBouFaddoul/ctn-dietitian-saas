export type ConnectionStatus = "not_connected" | "waiting" | "expired" | "connected" | "deactivated";

export function connectionStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "waiting":
      return "Waiting for client";
    case "expired":
      return "Join code expired";
    case "connected":
      return "Portal connected";
    case "deactivated":
      return "Portal deactivated";
    default:
      return "Not connected";
  }
}
