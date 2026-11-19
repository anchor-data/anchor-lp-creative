import "server-only";
import type { GenEvent } from "./services/generation";

/** Server-Sent Events response (spec ch.10 生成系: plan-start / plan-delta / plan-done / plan-error / done). */
export function sseResponse(run: (emit: (e: GenEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: GenEvent): void => {
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      };
      try {
        await run(emit);
      } catch (err) {
        const message = err instanceof Error && "code" in err ? err.message : "生成に失敗しました。時間を置いて再度お試しください";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
