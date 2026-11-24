import { after } from "next/server";
import { ulid } from "ulid";
import { ApiError, handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getSbRefreshState, runJob } from "@/server/jobs";
import { getRawClient } from "@/server/db/client";
import { dateTime } from "@/lib/format";

/** Current state of the manual Squad beyond refresh (J-16), polled by the 取り込み候補 page. */
export const GET = handler(async () => {
  await requireUser("review_candidates");
  return ok(await getSbRefreshState());
});

/** Starts J-16 in the background. One run per cooldown window keeps Squad beyond calls low. */
export const POST = handler(async () => {
  const user = await requireUser("review_candidates");
  const state = await getSbRefreshState();
  if (state.status === "running") return ok({ started: false, state });
  if (state.nextAllowedAt) throw new ApiError("RATE_LIMITED", `次に更新できるのは ${dateTime(state.nextAllowedAt)} 以降です`);
  await getRawClient().execute({
    sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'update', 'job', 'J-16', ?)",
    args: [ulid(), new Date().toISOString(), user.id, JSON.stringify({ manualRun: true })],
  });
  after(async () => {
    await runJob("J-16");
  });
  return ok({ started: true, state: { ...state, status: "running", startedAt: new Date().toISOString(), nextAllowedAt: null } }, { status: 202 });
});
