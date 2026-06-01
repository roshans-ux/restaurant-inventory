export type ApiErrorShape = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiError(code: string, message: string, status: number, details?: unknown) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
    } satisfies ApiErrorShape,
    { status },
  );
}

export function apiOk<T>(data: T, status = 200) {
  return Response.json({ ok: true, data }, { status });
}

/** Safely parse JSON from a fetch Response (handles empty bodies). */
export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function getApiErrorMessage(
  payload: { error?: { message?: string; details?: unknown } },
  fallback: string,
): string {
  const details = payload.error?.details;
  if (
    details &&
    typeof details === "object" &&
    "message" in details &&
    typeof (details as { message: unknown }).message === "string"
  ) {
    return (details as { message: string }).message;
  }
  return payload.error?.message ?? fallback;
}

