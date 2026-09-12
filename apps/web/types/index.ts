/**
 * MCP Sentinel에서 Tool 실행 요청에 대해 내리는 최종 검증 결정
 *
 * ALLOW  : 검증을 통과하여 실행 허용
 * REVIEW : 사용자의 추가 승인이 필요한 상태
 * BLOCK  : 검증에 실패하여 실행 차단
 */
export type Decision = "ALLOW" | "REVIEW" | "BLOCK";

/**
 * MCP Sentinel을 통해 처리된 하나의 Tool 실행 기록
 *
 * 요청 정보, 검증 결과, 실행 상태 및 결과를 포함하며
 * Dashboard의 검증 결과와 실행 이력에서 사용된다.
 */
export type Run = {
  // 실행 요청을 식별하기 위한 고유 ID
  id: string;

  // 실행 대상으로 선택된 Tool의 ID
  toolId: string;

  // Tool 실행 시 전달된 인자
  arguments: Record<string, unknown>;

  // 사용자가 입력한 자연어 요청
  prompt?: string;

  // 보안 검증을 통해 결정된 최종 실행 판단
  decision: Decision;

  // 현재 실행 처리 상태
  status: "completed" | "pending_review" | "blocked" | "rejected" | "failed";

  // Registry, 무결성, 권한 등의 개별 검증 결과
  checks: {
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }[];

  // REVIEW 또는 BLOCK 등의 판단이 내려진 이유
  reasons: string[];

  // Tool 실행이 완료된 경우 반환되는 결과
  result?: unknown;

  // 실행 또는 검증 과정에서 발생한 오류 메시지
  error?: string;

  // 실행 요청 생성 시각
  createdAt: string;

  // 실행 상태가 마지막으로 변경된 시각
  updatedAt: string;
};

/**
 * MCP Sentinel Registry에 등록된 Tool 정보
 *
 * Tool의 기본 정보와 승인 여부, 폐기 여부,
 * 허용된 권한 정보를 표현한다.
 */
export type Tool = {
  // Registry에서 Tool을 식별하기 위한 고유 ID
  toolId: string;

  // 사용자에게 표시되는 Tool 이름
  name: string;

  // Tool 기능에 대한 설명
  description: string;

  // Registry에 등록된 Tool 버전
  version: string;

  // Tool 등록 또는 배포 주체
  publisher: string;

  // Tool에 허용된 권한 목록
  permissions: string[];

  // Registry에서 승인된 Tool인지 여부
  approved: boolean;

  // 등록 이후 사용이 중단된 Tool인지 여부
  revoked: boolean;
};

/**
 * 데모 모드에서 MCP Sentinel의 검증 결과를 테스트하기 위한 시나리오
 *
 * 각 시나리오는 Tool 등록 정보, 무결성, 권한 또는
 * Registry 상태에 문제가 발생한 상황을 재현한다.
 */
export type Scenario =
  | "normal" // 정상 Tool
  | "tampered" // Manifest 변조
  | "revoked" // 폐기된 Tool
  | "version-mismatch" // 승인되지 않은 Tool 버전
  | "permission-denied" // 허용 범위를 벗어난 권한 요청
  | "registry-unavailable"; // Registry 조회 불가

/**
 * 공통 Icon 컴포넌트에서 사용할 수 있는 아이콘 이름
 *
 * 문자열을 제한하여 존재하지 않는 아이콘 이름이
 * 전달되는 것을 TypeScript 단계에서 방지한다.
 */
export type IconName =
  | "shield"
  | "grid"
  | "box"
  | "history"
  | "arrow"
  | "check"
  | "cross"
  | "clock"
  | "chain"
  | "refresh"
  | "spark";

export type ChatResponse =
  | {
      type: "answer";
      answer: string;
    }
  | {
      type: "run";
      run: Run;
      answer?: string;
    };
