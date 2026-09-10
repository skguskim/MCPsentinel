import type { ReactNode } from "react";


/**
 * Icon 컴포넌트에서 사용할 수 있는 아이콘 이름
 *
 * 지원하는 아이콘을 문자열 타입으로 제한하여
 * 존재하지 않는 아이콘 이름이 전달되는 것을 방지한다.
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


/**
 * Icon 컴포넌트에서 사용하는 Props
 */
type IconProps = {
  // 표시할 아이콘 종류
  name: IconName;

  // 아이콘의 가로/세로 크기
  // 전달하지 않으면 기본값으로 20px 사용
  size?: number;
};


/**
 * MCP Sentinel 전체에서 사용하는 공통 SVG Icon 컴포넌트
 *
 * name에 해당하는 SVG 요소를 선택하여 렌더링하고,
 * size 값을 통해 동일한 아이콘을 다양한 크기로 재사용할 수 있다.
 */
export default function Icon({
  name,
  size = 20,
}: IconProps) {

  /**
   * 각 IconName과 실제 SVG 도형을 연결하는 객체
   *
   * Record<IconName, ReactNode>를 사용하여
   * IconName에 정의된 모든 아이콘이 구현되도록 한다.
   */
  const paths: Record<IconName, ReactNode> = {

    // 보안 및 검증을 나타내는 Shield 아이콘
    shield: (
      <>
        <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-4.6" />
      </>
    ),


    // Dashboard 메뉴를 나타내는 Grid 아이콘
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),


    // Tool 또는 Registry 항목을 나타내는 Box 아이콘
    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5" />
      </>
    ),


    // 실행 이력을 나타내는 History 아이콘
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2" />
      </>
    ),


    // 화면 이동 및 실행 흐름을 나타내는 Arrow 아이콘
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),


    // 검증 성공 또는 완료 상태를 나타내는 Check 아이콘
    check: (
      <path d="m5 12 4 4L19 6" />
    ),


    // 검증 실패 또는 닫기 동작을 나타내는 Cross 아이콘
    cross: (
      <path d="m6 6 12 12M6 18 18 6" />
    ),


    // REVIEW 및 대기 상태를 나타내는 Clock 아이콘
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),


    // On-chain 및 Registry 연결을 나타내는 Chain 아이콘
    chain: (
      <>
        <path
          d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
          transform="translate(1 0) scale(.9 1)"
        />
      </>
    ),


    // Dashboard 데이터를 다시 조회하는 Refresh 아이콘
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
      </>
    ),


    // 새로운 요청 및 주요 기능을 강조하는 Spark 아이콘
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
  };


  /* ==============================
     SVG Rendering
     ============================== */

  return (
    <svg
      // 전달받은 size를 가로/세로 크기에 동일하게 적용
      width={size}
      height={size}

      // 모든 아이콘이 동일한 24 × 24 좌표계를 사용
      viewBox="0 0 24 24"

      // 내부를 채우지 않고 선으로 아이콘 표현
      fill="none"

      // 부모 요소의 글자색을 아이콘 색상으로 사용
      stroke="currentColor"

      // 전체 아이콘의 선 스타일 통일
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"

      // 아이콘은 장식 요소이므로 스크린 리더에서 제외
      aria-hidden="true"
    >
      {/* name에 해당하는 SVG 도형 선택 */}
      {paths[name]}
    </svg>
  );
}