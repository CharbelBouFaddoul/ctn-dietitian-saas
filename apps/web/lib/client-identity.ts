export function clientDisplayName(client: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  if (client.displayName?.trim()) {
    return client.displayName.trim();
  }
  return `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Client";
}

export function shortId(id: string): string {
  return id.slice(-8);
}

export function clientIdentityLine(client: {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const name = clientDisplayName(client);
  const email = client.email?.trim();
  return email ? `${name} · ${email}` : name;
}
