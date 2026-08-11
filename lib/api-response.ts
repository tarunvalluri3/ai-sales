import "server-only";

/** Consistent success/error JSON shape for every route handler. */
type SuccessBody<T> = { ok: true; data: T };
type ErrorBody = { ok: false; error: string };

export function jsonSuccess<T>(data: T, init?: ResponseInit): Response {
  const body: SuccessBody<T> = { ok: true, data };
  return Response.json(body, init);
}

export function jsonError(message: string, status: number): Response {
  const body: ErrorBody = { ok: false, error: message };
  return Response.json(body, { status });
}
