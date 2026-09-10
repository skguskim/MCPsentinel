import Icon, { type IconName } from "@/components/common/Icon";


/**
 * StatsGrid에서 필요한 통계 데이터
 *
 * Dashboard에서 계산된 Tool 및 실행 상태별 개수를 전달받아
 * 상단 통계 카드에 표시한다.
 */
type StatsGridProps = {
  // Dashboard 최초 데이터 로딩 여부
  loading: boolean;

  // Registry에 등록된 전체 Tool 개수
  toolsCount: number;

  // 정상적으로 실행 완료된 Run 개수
  completedCount: number;

  // 보안 검증 결과 BLOCK 처리된 Run 개수
  blockedCount: number;

  // 사용자의 추가 승인을 기다리는 Run 개수
  reviewCount: number;
};


/**
 * 개별 통계 카드에서 사용하는 Props
 */
type StatProps = {
  // 통계 카드에 표시할 아이콘
  icon: IconName;

  // 통계 항목 이름
  label: string;

  // 화면에 표시할 통계 값
  // 로딩 중에는 숫자 대신 "—" 문자열을 사용할 수 있다.
  value: number | string;

  // 통계 값에 대한 간단한 설명
  detail: string;

  // 아이콘에 적용할 시각적 색상 스타일
  tone: string;
};


/**
 * 하나의 Dashboard 통계 항목을 표시하는 재사용 카드
 *
 * 아이콘, 이름, 값, 설명을 Props로 전달받아
 * 동일한 형태의 통계 UI를 생성한다.
 */
function Stat({
  icon,
  label,
  value,
  detail,
  tone,
}: StatProps) {
  return (
    <div className="stat-card">

      {/* 통계 이름 및 상태별 아이콘 */}
      <div className="stat-top">
        <span>{label}</span>

        <span className={`stat-icon ${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>


      {/* 통계의 핵심 숫자 */}
      <strong className="stat-value">
        {value}
        <span>건</span>
      </strong>


      {/* 해당 통계가 의미하는 내용 */}
      <p>{detail}</p>
    </div>
  );
}


/**
 * MCP Sentinel의 주요 실행 통계를 표시하는 영역
 *
 * 등록된 Tool, 실행 완료, 차단된 요청,
 * 승인 대기 상태를 각각 Stat 카드로 구성한다.
 */
export default function StatsGrid({
  loading,
  toolsCount,
  completedCount,
  blockedCount,
  reviewCount,
}: StatsGridProps) {
  return (
    <section
      className="stats-grid"
      aria-label="실행 통계"
    >

      {/* Registry에 등록되어 있는 Tool 수 */}
      <Stat
        icon="box"
        label="등록된 Tool"
        value={loading ? "—" : toolsCount}
        detail="연결된 Tool 목록"
        tone="blue"
      />


      {/* 검증을 거쳐 실제 실행까지 완료된 요청 수 */}
      <Stat
        icon="check"
        label="실행 완료"
        value={loading ? "—" : completedCount}
        detail="검증 후 실행된 요청"
        tone="green"
      />


      {/* 보안 검증 과정에서 실행이 차단된 요청 수 */}
      <Stat
        icon="shield"
        label="차단된 요청"
        value={loading ? "—" : blockedCount}
        detail="실행 전에 위험 차단"
        tone="red"
      />


      {/* REVIEW 결정으로 사용자 승인을 기다리는 요청 수 */}
      <Stat
        icon="clock"
        label="승인 대기"
        value={loading ? "—" : reviewCount}
        detail="사용자 확인이 필요해요"
        tone="amber"
      />
    </section>
  );
}