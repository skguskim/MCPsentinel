export const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : "요청 중 오류가 발생했어요.";
  
  export const time = (value: string) =>
    new Date(value).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });