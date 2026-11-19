import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ulid } from "ulid";

// Error envelope (spec ch.10): {"error": {"code", "message", "details"}}; messages are Japanese.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL: 500,
};

export interface ErrorDetail {
  field?: string;
  reason: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
  }
}

export const notFound = (what = "対象"): ApiError => new ApiError("NOT_FOUND", `${what}が見つかりません`);
export const forbidden = (): ApiError => new ApiError("FORBIDDEN", "この操作を行う権限がありません");
export const conflict = (): ApiError =>
  new ApiError("CONFLICT", "他の人が先に更新しました。画面を読み込み直してください");

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: STATUS[err.code] },
    );
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join("."), reason: i.message }));
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: err.issues[0]?.message ?? "入力に不備があります", details } },
      { status: 400 },
    );
  }
  const errorId = ulid();
  // Structured log without request bodies or secrets (spec ch.11)
  console.error(JSON.stringify({ level: "error", errorId, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  return NextResponse.json(
    { error: { code: "INTERNAL", message: `想定外のエラーが発生しました（エラーID: ${errorId}）`, details: [{ reason: "internal", errorId }] } },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown ApiError/ZodError become the standard envelope. */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "リクエストの形式が正しくありません");
  }
  return schema.parse(body);
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}
