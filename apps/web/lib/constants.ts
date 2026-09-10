import type { Decision, Run, Scenario } from "@/types";


/* ==============================
   Decision Descriptions
   ============================== */

/**
 * MCP Sentinel의 최종 검증 결정에 대한 사용자 안내 문구
 *
 * VerificationPanel에서 ALLOW / REVIEW / BLOCK 결과와 함께 표시하여
 * 각 결정이 어떤 의미인지 사용자가 바로 이해할 수 있도록 한다.
 */
export const decisionDescriptions: Record<Decision, string> = {
  // 모든 검증을 통과하여 Tool 실행이 허용된 상태
  ALLOW: "검증을 통과해 Tool 실행이 허용되었습니다.",

  // 자동 실행하지 않고 사용자의 추가 승인을 기다리는 상태
  REVIEW: "실행 전 사용자의 추가 승인이 필요합니다.",

  // 신뢰 검증에 실패하여 Tool 실행이 차단된 상태
  BLOCK: "신뢰 검증에 실패해 Tool 실행이 차단되었습니다.",
};


/* ==============================
   Demo Scenarios
   ============================== */

/**
 * Demo Registry에서 보안 검증 흐름을 테스트하기 위한 시나리오 목록
 *
 * 정상 상황뿐만 아니라 Manifest 변조, Tool 폐기, 버전 불일치,
 * 권한 위반, Registry 장애 등의 상황을 선택하여
 * MCP Sentinel의 검증 결과를 확인할 수 있다.
 */
export const scenarios: {
  id: Scenario;
  name: string;
  description: string;
}[] = [
  {
    // 모든 등록 정보와 검증 조건이 정상인 상태
    id: "normal",
    name: "정상 Tool",
    description: "승인된 정보와 일치",
  },

  {
    // Tool Manifest가 Registry에 등록된 정보와 다른 상황
    id: "tampered",
    name: "Manifest 변조",
    description: "등록된 해시와 불일치",
  },

  {
    // Registry에 등록되었지만 이후 사용이 중단된 Tool
    id: "revoked",
    name: "Tool 폐기",
    description: "등록 후 사용이 중단됨",
  },

  {
    // 현재 Tool 버전이 Registry에서 승인한 버전과 다른 상황
    id: "version-mismatch",
    name: "미승인 버전",
    description: "승인 버전과 불일치",
  },

  {
    // Tool이 Registry에서 허용하지 않은 권한을 요청하는 상황
    id: "permission-denied",
    name: "금지 권한",
    description: "허용 범위를 벗어난 권한",
  },

  {
    // Registry에 접근할 수 없어 신뢰 기준을 확인할 수 없는 상황
    id: "registry-unavailable",
    name: "Registry 장애",
    description: "신뢰 기준 조회 불가",
  },
];


/* ==============================
   Run Status Labels
   ============================== */

/**
 * 서버에서 사용하는 Run status 값을
 * Dashboard에서 표시할 한국어 상태명으로 변환한다.
 *
 * Record<Run["status"], string>을 사용하여
 * Run에 정의된 모든 status에 대응하는 표시 문구가 존재하도록 한다.
 */
export const statusNames: Record<Run["status"], string> = {
  // Tool 실행까지 정상적으로 완료
  completed: "실행 완료",

  // REVIEW 결정으로 사용자의 승인을 기다리는 상태
  pending_review: "승인 대기",

  // 보안 검증 결과 BLOCK 처리된 상태
  blocked: "실행 차단",

  // REVIEW 요청을 사용자가 거절한 상태
  rejected: "승인 거절",

  // Tool 실행 과정에서 오류가 발생한 상태
  failed: "실행 실패",
};