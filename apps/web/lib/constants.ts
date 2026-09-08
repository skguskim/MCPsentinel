import type { Run, Scenario } from "@/types";

export const scenarios: {
  id: Scenario;
  name: string;
  description: string;
}[] = [
  {
    id: "normal",
    name: "정상 Tool",
    description: "승인된 정보와 일치",
  },
  {
    id: "tampered",
    name: "Manifest 변조",
    description: "등록된 해시와 불일치",
  },
  {
    id: "revoked",
    name: "Tool 폐기",
    description: "등록 후 사용이 중단됨",
  },
  {
    id: "version-mismatch",
    name: "미승인 버전",
    description: "승인 버전과 불일치",
  },
  {
    id: "permission-denied",
    name: "금지 권한",
    description: "허용 범위를 벗어난 권한",
  },
  {
    id: "registry-unavailable",
    name: "Registry 장애",
    description: "신뢰 기준 조회 불가",
  },
];

export const statusNames: Record<Run["status"], string> = {
  completed: "실행 완료",
  pending_review: "승인 대기",
  blocked: "실행 차단",
  rejected: "승인 거절",
  failed: "실행 실패",
};