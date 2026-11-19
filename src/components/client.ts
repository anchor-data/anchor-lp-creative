"use client";
// Browser-side API helpers. Errors keep the server's Japanese message (spec ch.10).

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { field?: string; reason: string; [k: string]: unknown }[];
}

export class ClientApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message);
  }
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.body.details ?? []) if (d.field && !out[d.field]) out[d.field] = String(d.reason).length > 30 || /[ぁ-んァ-ン一-龥]/.test(d.reason) ? d.reason : this.body.message;
    return out;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let body: ApiErrorBody = { code: "INTERNAL", message: `通信に失敗しました（${res.status}）` };
    try {
      const parsed = (await res.json()) as { error?: ApiErrorBody };
      if (parsed.error) body = parsed.error;
    } catch {
      /* non-JSON error page */
    }
    throw new ClientApiError(res.status, body);
  }
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ClientApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "想定外のエラーが発生しました";
}

export interface SseEvent {
  event: string;
  data: unknown;
}

/** POSTs JSON and reads a text/event-stream response, calling onEvent per event. */
export async function postSse(path: string, json: unknown, onEvent: (e: SseEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json), signal });
  if (!res.ok || !res.body) {
    let body: ApiErrorBody = { code: "INTERNAL", message: `通信に失敗しました（${res.status}）` };
    try {
      const parsed = (await res.json()) as { error?: ApiErrorBody };
      if (parsed.error) body = parsed.error;
    } catch {
      /* ignore */
    }
    throw new ClientApiError(res.status, body);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (data !== undefined) onEvent({ event, data: JSON.parse(data) });
    }
  }
}

export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key}` : null;
}
