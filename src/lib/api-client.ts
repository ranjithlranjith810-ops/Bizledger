"use client";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface HttpClientOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  businessId?: string;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `Request failed (${response.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      return parsed.error ?? parsed.message ?? `Request failed (${response.status})`;
    } catch {
      return text;
    }
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function apiFetch<T>(path: string, options: HttpClientOptions = {}): Promise<T> {
  const { body, businessId, headers, ...rest } = options;
  const separator = path.includes("?") ? "&" : "?";
  const url = businessId ? `${path}${separator}businessId=${encodeURIComponent(businessId)}` : path;

  const response = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await readErrorBody(response);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const http = {
  get: <T>(path: string, options: HttpClientOptions = {}) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body: unknown, options: HttpClientOptions = {}) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body: unknown, options: HttpClientOptions = {}) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body: unknown, options: HttpClientOptions = {}) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  del: <T>(path: string, options: HttpClientOptions = {}) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};