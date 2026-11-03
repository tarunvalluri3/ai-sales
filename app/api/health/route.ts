import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage } from "@/lib/errors";
import { runDeepHealthCheck } from "@/lib/health";
import { isAuthorizedCronRequest } from "@/lib/scheduler/auth";

const querySchema = z.object({
  verbose: z.enum(["true", "false"]).optional(),
  deep: z.enum(["1", "true"]).optional(),
});

type HealthResponse = {
  status: "ok";
  timestamp: string;
  uptimeSeconds?: number;
};

/**
 * `GET /api/health` -- liveness only (unchanged): the process is up.
 *
 * `GET /api/health?deep=1` (production readiness, item 9) -- a real check:
 * database round trip + the scheduler has run recently (lib/health-rules.ts).
 * Answers 503 when the database is down or the scheduler has stopped, so an
 * uptime monitor can alert on either. Anyone gets the status and the two
 * check states; the counts (dead letters, open billing cancellations) are
 * returned only with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    verbose: request.nextUrl.searchParams.get("verbose") ?? undefined,
    deep: request.nextUrl.searchParams.get("deep") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError("Invalid query parameter", 400);
  }

  try {
    if (parsed.data.deep) {
      const report = await runDeepHealthCheck();
      const authorized = isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET);
      return jsonSuccess(
        {
          status: report.status,
          timestamp: new Date().toISOString(),
          checks: report.checks,
          ...(authorized ? { details: report.details } : {}),
        },
        { status: report.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response: HealthResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      ...(parsed.data.verbose === "true"
        ? { uptimeSeconds: process.uptime() }
        : {}),
    };

    return jsonSuccess(response);
  } catch (error) {
    const message = logAndGetUserMessage(error);
    return jsonError(message, 500);
  }
}
