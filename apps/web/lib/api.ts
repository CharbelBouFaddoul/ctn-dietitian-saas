import { humanizeApiMessage } from "./humanize-error";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data as { message?: string | string[] };
    const raw = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : (payload.message ?? "Request failed");
    throw new ApiError(humanizeApiMessage(raw), response.status);
  }

  return data as T;
}

export async function logout(): Promise<void> {
  await api("/api/v1/auth/logout", { method: "POST" });
}
