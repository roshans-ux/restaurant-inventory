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

