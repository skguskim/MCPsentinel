import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Sentinel · 실행 전 신뢰 검증",
  description:
    "MCP Tool의 등록 정보와 권한을 확인하고, 검증된 요청만 실행하는 보안 게이트웨이 데모입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
