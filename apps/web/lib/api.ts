/**
 * MCP Sentinel 백엔드 API를 호출하기 위한 공통 요청 함수
 *
 * path : 호출할 API 경로
 * body : 서버로 전달할 요청 데이터
 *
 * body가 없으면 GET 요청,
 * body가 있으면 POST 요청으로 처리한다.
 *
 * 제네릭 T를 사용하여 각 API가 반환하는 데이터 타입을
 * 호출하는 쪽에서 지정할 수 있다.
 */
export async function api<T>(
    path: string,
    body?: unknown,
  ): Promise<T> {

    /* ==============================
       API Request
       ============================== */

    // Next.js의 /api 경로를 통해 백엔드 API 요청
    const response = await fetch(`/api${path}`, {
      // 요청 데이터가 없으면 조회(GET), 있으면 데이터 전송(POST)
      method: body === undefined ? "GET" : "POST",

      // POST 요청일 경우 JSON 형식임을 서버에 전달
      headers:
        body === undefined
          ? undefined
          : { "Content-Type": "application/json" },

      // 전달받은 데이터를 JSON 문자열로 변환
      body: body === undefined
        ? undefined
        : JSON.stringify(body),

      // 이전 응답을 캐시하지 않고 항상 최신 데이터를 요청
      cache: "no-store",

      // 서버가 응답하지 않을 경우 30초 후 요청 중단
      signal: AbortSignal.timeout(30_000),
    });


    /* ==============================
       Response Parsing
       ============================== */

    // 서버 응답을 JSON으로 변환
    // JSON 파싱에 실패한 경우 null로 처리하여 아래에서 예외 처리
    const payload = (await response.json().catch(() => null)) as
      | (T & {
          error?: string | { message?: string };
          message?: string;
        })
      | null;


    /* ==============================
       Error Handling
       ============================== */

    // HTTP 요청이 실패한 경우 서버가 전달한 오류 메시지를 우선 사용
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

    // HTTP 요청은 성공했지만 정상적인 JSON 응답을 받지 못한 경우
    if (payload === null) {
      throw new Error("서버에서 올바른 응답을 받지 못했어요.");
    }


    /* ==============================
       Successful Response
       ============================== */

    // 정상적으로 파싱된 API 응답 반환
    return payload;
  }