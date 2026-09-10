/**
 * Topbar 컴포넌트에서 사용하는 Props
 */
type TopbarProps = {
  // MCP Sentinel Gateway 연결 여부
  connected: boolean;
};

/**
 * Dashboard 상단에 표시되는 Topbar
 *
 * 현재 Workspace 위치를 보여주고,
 * MCP Sentinel 시스템의 연결 상태를 표시한다.
 */
export default function Topbar({ connected }: TopbarProps) {
  return (
    <header className="topbar">
      {/* 현재 Dashboard 위치를 나타내는 Breadcrumb */}
      <div className="breadcrumb">
        Workspace <span>/</span> <strong>보안 대시보드</strong>
      </div>

      {/* 시스템 연결 상태 및 사용자 영역 */}
      <div className="topbar-right">
        {/* Gateway 연결 여부에 따라
            상태 스타일과 표시 문구를 변경 */}
        <span className={`connection-label ${connected ? "is-connected" : ""}`}>
          <span className="status-dot" />

          {connected ? "SYSTEM CONNECTED" : "CONNECTING"}
        </span>

        {/* MCP Sentinel을 나타내는 간단한 Avatar */}
        <span className="avatar">MS</span>
      </div>
    </header>
  );
}
