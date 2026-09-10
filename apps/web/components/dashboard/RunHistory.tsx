import Icon from "@/components/common/Icon";
import Badge from "@/components/common/Badge";
import type { Run } from "@/types";

type RunHistoryProps = {
  runs: Run[];
  sortedRuns: Run[];
  selectedRun: Run | null;
  loading: boolean;
  busy: string | null;
  statusNames: Record<string, string>;
  time: (value: string) => string;
  refresh: () => void | Promise<void>;
  setBusy: (value: string | null) => void;
  setError: (value: string | null) => void;
  setSelectedId: (value: string) => void;
};

export default function RunHistory({
  runs,
  sortedRuns,
  selectedRun,
  loading,
  busy,
  statusNames,
  time,
  refresh,
  setBusy,
  setError,
  setSelectedId,
}: RunHistoryProps) {
  return (
    <section
      className="panel history-panel"
      id="history"
      aria-labelledby="history-heading"
    >
      <div className="table-heading">
        <div>
          <h2 id="history-heading">
            실행 이력{" "}
            <span className="heading-count">{runs.length}</span>
          </h2>

          <p>허용, 승인 대기, 차단된 요청을 한곳에서 확인하세요.</p>
        </div>

        <button
          className="refresh-button"
          onClick={async () => {
            setBusy("refresh");
            setError(null);

            try {
              await refresh();
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null}
        >
          <Icon name="refresh" size={16} />
          <span>
            {busy === "refresh" ? "불러오는 중" : "새로고침"}
          </span>
        </button>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>요청 / TOOL</th>
              <th>결정</th>
              <th>실행 상태</th>
              <th>요청 시각</th>
              <th>
                <span className="sr-only">상세 보기</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedRuns.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-table">
                  {loading
                    ? "실행 이력을 불러오고 있어요."
                    : "아직 실행한 요청이 없어요. 위에서 첫 검증을 시작하세요."}
                </td>
              </tr>
            ) : (
              sortedRuns.map((run) => (
                <tr
                  key={run.id}
                  className={`history-row decision-${run.decision.toLowerCase()} ${
                    selectedRun?.id === run.id ? "selected-row" : ""
                  }`}
                >
                  <td>
                    <strong className="request-title">
                      {run.prompt || run.toolId}
                    </strong>

                    <code className="tool-code">
                      {run.toolId}
                    </code>
                  </td>

                  <td>
                    <Badge decision={run.decision} />
                  </td>

                  <td>
                    <span
                      className={`run-status ${
                        run.status === "completed"
                          ? "green"
                          : ""
                      }`}
                    >
                      {statusNames[run.status]}
                    </span>
                  </td>

                  <td
                    className="time-cell"
                    title={new Date(
                      run.createdAt,
                    ).toLocaleString("ko-KR")}
                  >
                    {time(run.createdAt)}
                  </td>

                  <td>
                    <button
                      className="detail-button"
                      onClick={() => {
                        setSelectedId(run.id);

                        document
                          .getElementById(
                            "verification-heading",
                          )
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                      aria-label={`${run.toolId} ${time(
                        run.createdAt,
                      )} 검증 상세 보기`}
                    >
                      상세
                      <Icon name="arrow" size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}