export function canManageClients(role: string | null | undefined): boolean {
  return role === "OWNER";
}
