import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage } from "@/lib/errors";

const querySchema = z.object({
  verbose: z.enum(["true", "false"]).optional(),
});

type HealthResponse = {
  status: "ok";
  timestamp: string;
  uptimeSeconds?: number;
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    verbose: request.nextUrl.searchParams.get("verbose") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError("Invalid query parameter: verbose", 400);
  }

  try {
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
