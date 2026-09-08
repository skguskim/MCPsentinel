export async function api<T>(
    path: string, 
    body?: unknown
): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string | { message?: string }; message?: string })
      | null;
    if (!response.ok) {
      const reason =
        typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.message;
      throw new Error(
        reason ||
          payload?.message ||
          `요청을 처리하지 못했어요. (HTTP ${response.status})`,
      );
    }
    if (payload === null)
      throw new Error("서버에서 올바른 응답을 받지 못했어요.");
    return payload;
  }