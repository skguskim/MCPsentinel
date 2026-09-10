/**
 * API 요청이나 비동기 작업에서 발생한 오류를
 * 사용자에게 표시할 문자열 형태로 변환한다.
 *
 * Error 객체인 경우 실제 오류 메시지를 사용하고,
 * 그 외의 값은 기본 오류 메시지로 처리한다.
 */
export const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : "요청 중 오류가 발생했어요.";


  /**
   * 서버에서 전달받은 날짜/시간 문자열을
   * Dashboard에서 표시할 한국 시간 형식으로 변환한다.
   *
   * 예: "13:25:42"
   */
  export const time = (value: string) =>
    new Date(value).toLocaleTimeString("ko-KR", {
      // 시, 분, 초를 각각 두 자리 숫자로 표시
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",

      // AM/PM 대신 24시간 형식 사용
      hour12: false,
    });