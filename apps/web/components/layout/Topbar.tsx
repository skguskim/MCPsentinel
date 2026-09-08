type TopbarProps = {
    connected: boolean;
  };
  
  export default function Topbar({ connected }: TopbarProps) {
    return (
      <header className="topbar">
        <div className="breadcrumb">
          Workspace <span>/</span> <strong>보안 대시보드</strong>
        </div>
  
        <div className="topbar-right">
          <span
            className={`connection-label ${connected ? "is-connected" : ""}`}
          >
            <span className="status-dot" />
            {connected ? "SYSTEM CONNECTED" : "CONNECTING"}
          </span>
  
          <span className="avatar">MS</span>
        </div>
      </header>
    );
  }