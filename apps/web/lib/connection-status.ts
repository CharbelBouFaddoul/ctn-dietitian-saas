export type ConnectionStatus = "not_connected" | "waiting" | "expired" | "connected" | "deactivated";

export function connectionStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "waiting":
      return "Waiting for client";
    case "expired":
      return "Join code expired";
    case "connected":
      return "Portal active";
    case "deactivated":
      return "Portal access deactivated";
    case "not_connected":
    default:
      return "Portal not activated";
  }
}
