import Icon from "@/components/common/Icon";
import type { Tool } from "@/types";


/**
 * ToolRegistry 컴포넌트에서 사용하는 Props
 *
 * Registry에서 조회한 Tool 목록과 현재 Registry 모드를 받아
 * 각 Tool의 등록 정보와 상태를 카드 형태로 표시한다.
 */
type ToolRegistryProps = {
  // Registry에 등록된 Tool 목록
  tools: Tool[];

  // Tool 목록을 처음 불러오는 중인지 여부
  loading: boolean;

  // 현재 Registry 모드
  // demo 또는 onchain 값을 사용하며 연결 전에는 null일 수 있다.
  registryMode: string | null;
};


/**
 * 현재 Registry에 등록된 Tool 정보를 표시하는 영역
 *
 * 각 Tool의 이름, 설명, 버전, 권한, Publisher,
 * 승인 및 폐기 상태를 한눈에 확인할 수 있도록 제공한다.
 */
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
      {/* Registry 제목, Tool 개수 및 현재 Registry 모드 표시 */}
      <div className="table-heading">
        <div>
          <h2 id="registry-heading">
            Tool Registry{" "}
            <span className="heading-count">{tools.length}</span>
          </h2>

          <p>현재 연결된 Tool의 등록 정보와 권한</p>
        </div>

        {/* 현재 Registry 환경을 사용자에게 표시 */}
        <span className="outline-pill">
          {registryMode === "onchain" ? "ON-CHAIN" : "LOCAL DEMO"}
        </span>
      </div>


      {/* Registry에 등록된 Tool 카드 목록 */}
      <div className="tool-grid">
        {tools.length === 0 ? (

          /* Tool 데이터가 없을 경우 로딩 상태 또는 연결 안내 표시 */
          <p className="empty-table">
            {loading
              ? "Tool 목록을 불러오고 있어요."
              : "표시할 Tool이 없어요. Gateway 연결을 확인하세요."}
          </p>
        ) : (

          /* 각 Tool을 개별 카드 형태로 표시 */
          tools.map((tool) => (
            <article className="tool-card" key={tool.toolId}>

              {/* Tool 아이콘 및 Registry 상태 */}
              <div className="tool-card-top">
                <span className="tool-icon">
                  <Icon name="box" size={21} />
                </span>

                {/* revoked 상태를 가장 우선적으로 표시하고,
                    그 외에는 승인 여부에 따라 상태를 구분 */}
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


              {/* Tool 기본 정보 */}
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>


              {/* Tool 식별자 및 등록 버전 */}
              <div className="tool-card-meta">
                <code>{tool.toolId}</code>

                <span>
                  {/* version 값에 이미 v가 포함된 경우 중복 표시 방지 */}
                  v{tool.version.replace(/^v/, "")}
                </span>
              </div>


              {/* Tool에 허용된 권한 목록 */}
              <div className="permission-tags">
                {tool.permissions.map((permission) => (
                  <span key={permission}>
                    {permission}
                  </span>
                ))}
              </div>


              {/* Tool을 등록하거나 배포한 Publisher 정보 */}
              <div className="publisher">
                <span>Publisher</span>

                <code title={tool.publisher}>
                  {/* 긴 Publisher 값은 앞/뒤 일부만 보여주고
                      전체 값은 title 속성으로 확인할 수 있도록 처리 */}
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