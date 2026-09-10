import type { Decision } from "@/types";

/**
 * Badge 컴포넌트에서 사용하는 Props
 */
type BadgeProps = {
  // MCP Sentinel의 최종 실행 결정
  decision: Decision;
};

/**
 * MCP Sentinel의 최종 검증 결정을 표시하는 공통 Badge
 *
 * ALLOW / REVIEW / BLOCK 값을 화면에 표시하고,
 * 각 결정에 맞는 CSS 스타일을 적용한다.
 *
 * VerificationPanel과 RunHistory 등에서 재사용된다.
 */
export default function Badge({ decision }: BadgeProps) {
  return (
    <span
      // Decision 값을 소문자로 변환하여
      // allow / review / block CSS 클래스로 사용
      className={`badge ${decision.toLowerCase()}`}
    >
      {/* 결정 상태를 시각적으로 표현하는 상태 표시점 */}
      <span className="status-dot" />

      {/* ALLOW / REVIEW / BLOCK */}
      {decision}
    </span>
  );
}
