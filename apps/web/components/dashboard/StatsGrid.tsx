import Icon, { type IconName } from "@/components/common/Icon";

type StatsGridProps = {
  loading: boolean;
  toolsCount: number;
  completedCount: number;
  blockedCount: number;
  reviewCount: number;
};

type StatProps = {
  icon: IconName;
  label: string;
  value: number | string;
  detail: string;
  tone: string;
};

function Stat({
  icon,
  label,
  value,
  detail,
  tone,
}: StatProps) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>

        <span className={`stat-icon ${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>

      <strong className="stat-value">
        {value}
        <span>건</span>
      </strong>

      <p>{detail}</p>
    </div>
  );
}

export default function StatsGrid({
  loading,
  toolsCount,
  completedCount,
  blockedCount,
  reviewCount,
}: StatsGridProps) {
  return (
    <section className="stats-grid" aria-label="실행 통계">
      <Stat
        icon="box"
        label="등록된 Tool"
        value={loading ? "—" : toolsCount}
        detail="연결된 Tool 목록"
        tone="blue"
      />

      <Stat
        icon="check"
        label="실행 완료"
        value={loading ? "—" : completedCount}
        detail="검증 후 실행된 요청"
        tone="green"
      />

      <Stat
        icon="shield"
        label="차단된 요청"
        value={loading ? "—" : blockedCount}
        detail="실행 전에 위험 차단"
        tone="red"
      />

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