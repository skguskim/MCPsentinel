import Icon from "@/components/common/Icon";

/**
 * Sidebar 컴포넌트에서 사용하는 Props
 *
 * 등록된 Tool 개수와 Gateway 연결 상태를 받아
 * 사이드바의 Registry 정보 및 연결 상태를 표시한다.
 */
type SidebarProps = {
  // 현재 Registry에 등록된 Tool 개수
  toolsCount: number;

  // MCP Sentinel Gateway 연결 여부
  connected: boolean;
};

/**
 * MCP Sentinel Dashboard의 좌측 사이드바
 *
 * 프로젝트 브랜드, 주요 화면 이동 메뉴,
 * Tool 개수 및 Gateway 연결 상태를 제공한다.
 */
export default function Sidebar({ toolsCount, connected }: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* MCP Sentinel 브랜드 영역
          클릭하면 Dashboard 상단으로 이동 */}
      <a href="#overview" className="brand" aria-label="MCP Sentinel 홈">
        <span className="brand-icon">
          <Icon name="shield" size={26} />
        </span>

        <span>
          MCP<span className="brand-sub">SENTINEL</span>
        </span>
      </a>

      {/* 현재 Workspace 및 프로젝트 버전 표시 */}
      <div className="workspace-label">
        WORKSPACE <span>v0.1</span>
      </div>

      {/* Dashboard 주요 영역으로 이동하는 네비게이션 */}
      <nav aria-label="주요 메뉴">
        {/* Dashboard 상단으로 이동 */}
        <a href="#overview" className="nav-link active">
          <Icon name="grid" />
          보안 대시보드
          <span className="nav-active-dot" />
        </a>

        {/* Tool Registry 영역으로 이동
            현재 등록된 Tool 개수를 함께 표시 */}
        <a href="#registry" className="nav-link">
          <Icon name="box" />
          Tool Registry
          <span className="nav-count">{toolsCount}</span>
        </a>

        {/* Tool 실행 이력 영역으로 이동 */}
        <a href="#history" className="nav-link">
          <Icon name="history" />
          실행 이력
        </a>
      </nav>

      {/* MCP Sentinel의 역할을 설명하는 브랜드 메시지 영역 */}
      <div className="sidebar-bottom">
        {/* Off-chain과 On-chain 신뢰 검증 구조를 상징하는 시각 요소 */}
        <div className="trust-illustration">
          <Icon name="chain" size={26} />
          <span className="trust-line" />
          <Icon name="shield" size={26} />
        </div>

        <strong>Intelligence meets trust.</strong>

        <p>
          선택은 AI가,
          <br />
          실행 전 검증은 Sentinel이.
        </p>

        <span className="outline-pill">OFF-CHAIN × ON-CHAIN</span>
      </div>

      {/* Gateway 연결 상태 표시 */}
      <div className="sidebar-footer">
        {/* 연결 상태에 따라 상태 표시등 색상 변경 */}
        <span className={`status-dot ${connected ? "green" : "muted"}`} />

        {connected ? "Gateway 연결됨" : "Gateway 연결 확인 중"}
      </div>
    </aside>
  );
}
