import Icon from "@/components/common/Icon";

type SidebarProps = {
    toolsCount: number;
    connected: boolean;
  };
  
  export default function Sidebar({
    toolsCount,
    connected,
  }: SidebarProps) {
    return (
      <aside className="sidebar">
        <a href="#overview" className="brand" aria-label="MCP Sentinel 홈">
          <span className="brand-icon">
            <Icon name="shield" size={26} />
          </span>
  
          <span>
            MCP<span className="brand-sub">SENTINEL</span>
          </span>
        </a>
  
        <div className="workspace-label">
          WORKSPACE <span>v0.1</span>
        </div>
  
        <nav aria-label="주요 메뉴">
          <a href="#overview" className="nav-link active">
            <Icon name="grid" />
            보안 대시보드
            <span className="nav-active-dot" />
          </a>
  
          <a href="#registry" className="nav-link">
            <Icon name="box" />
            Tool Registry
            <span className="nav-count">{toolsCount}</span>
          </a>
  
          <a href="#history" className="nav-link">
            <Icon name="history" />
            실행 이력
          </a>
        </nav>
  
        <div className="sidebar-bottom">
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
  
          <span className="outline-pill">
            OFF-CHAIN × ON-CHAIN
          </span>
        </div>
  
        <div className="sidebar-footer">
          <span
            className={`status-dot ${connected ? "green" : "muted"}`}
          />
  
          {connected
            ? "Gateway 연결됨"
            : "Gateway 연결 확인 중"}
        </div>
      </aside>
    );
  }