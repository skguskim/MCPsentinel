import Icon from "@/components/common/Icon";
import type { Tool } from "@/types";

type ToolRegistryProps = {
  tools: Tool[];
  loading: boolean;
  registryMode: string | null;
};

export default function ToolRegistry({
  tools,
  loading,
  registryMode,
}: ToolRegistryProps) {
  return (
    <section
      className="panel registry-panel"
      id="registry"
      aria-labelledby="registry-heading"
    >
      <div className="table-heading">
        <div>
          <h2 id="registry-heading">
            Tool Registry{" "}
            <span className="heading-count">{tools.length}</span>
          </h2>

          <p>현재 연결된 Tool의 등록 정보와 권한</p>
        </div>

        <span className="outline-pill">
          {registryMode === "onchain" ? "ON-CHAIN" : "LOCAL DEMO"}
        </span>
      </div>

      <div className="tool-grid">
        {tools.length === 0 ? (
          <p className="empty-table">
            {loading
              ? "Tool 목록을 불러오고 있어요."
              : "표시할 Tool이 없어요. Gateway 연결을 확인하세요."}
          </p>
        ) : (
          tools.map((tool) => (
            <article className="tool-card" key={tool.toolId}>
              <div className="tool-card-top">
                <span className="tool-icon">
                  <Icon name="box" size={21} />
                </span>

                <span
                  className={`tool-state ${
                    tool.revoked
                      ? "red"
                      : tool.approved
                        ? "green"
                        : "amber"
                  }`}
                >
                  <span className="status-dot" />

                  {tool.revoked
                    ? "폐기됨"
                    : tool.approved
                      ? "승인됨"
                      : "미승인"}
                </span>
              </div>

              <h3>{tool.name}</h3>
              <p>{tool.description}</p>

              <div className="tool-card-meta">
                <code>{tool.toolId}</code>

                <span>
                  v{tool.version.replace(/^v/, "")}
                </span>
              </div>

              <div className="permission-tags">
                {tool.permissions.map((permission) => (
                  <span key={permission}>
                    {permission}
                  </span>
                ))}
              </div>

              <div className="publisher">
                <span>Publisher</span>

                <code title={tool.publisher}>
                  {tool.publisher.length > 20
                    ? `${tool.publisher.slice(0, 8)}…${tool.publisher.slice(-6)}`
                    : tool.publisher}
                </code>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}