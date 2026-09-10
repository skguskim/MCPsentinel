import Icon from "@/components/common/Icon";
import Badge from "@/components/common/Badge";
import type { Run } from "@/types";


/**
 * RunHistory 컴포넌트에서 사용하는 Props
 *
 * 실행 이력 목록과 선택 상태를 받아 테이블로 표시하고,
 * 새로고침 및 상세 보기 선택 기능을 제공한다.
 */
type RunHistoryProps = {
  // 서버에서 조회한 전체 실행 이력
  runs: Run[];

  // 생성 시각 기준으로 정렬된 실행 이력
  sortedRuns: Run[];

  // 현재 VerificationPanel에 표시 중인 Run
  selectedRun: Run | null;

  // 최초 실행 이력 로딩 여부
  loading: boolean;

  // 현재 진행 중인 비동기 작업
  busy: string | null;

  // Run status 값을 사용자용 문자열로 변환하는 목록
  statusNames: Record<string, string>;

  // 서버 시간 문자열을 화면 표시용 시간으로 변환하는 함수
  time: (value: string) => string;

  // Dashboard 데이터를 다시 조회하는 함수
  refresh: () => void | Promise<void>;

  // 현재 진행 중인 작업 상태 변경
  setBusy: (value: string | null) => void;

  // 오류 메시지 상태 변경
  setError: (value: string | null) => void;

  // 상세 화면에 표시할 Run ID 변경
  setSelectedId: (value: string) => void;
};


/**
 * MCP Sentinel의 전체 Tool 실행 이력을 표시하는 테이블
 *
 * 각 Run의 요청 내용, 실행 결정, 처리 상태, 요청 시각을 보여주며
 * 사용자가 특정 Run을 선택하면 해당 검증 결과로 이동한다.
 */
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
      {/* 실행 이력 제목, 전체 개수 및 새로고침 버튼 */}
      <div className="table-heading">
        <div>
          <h2 id="history-heading">
            실행 이력{" "}
            <span className="heading-count">{runs.length}</span>
          </h2>

          <p>허용, 승인 대기, 차단된 요청을 한곳에서 확인하세요.</p>
        </div>


        {/* 서버에서 최신 Dashboard 데이터를 다시 조회 */}
        <button
          className="refresh-button"
          onClick={async () => {
            // 새로고침 중 다른 작업이 중복 실행되지 않도록 busy 상태 설정
            setBusy("refresh");

            // 이전 오류 메시지 초기화
            setError(null);

            try {
              await refresh();
            } finally {
              // 성공/실패 여부와 관계없이 작업 상태 해제
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


      {/* 작은 화면에서는 테이블을 가로 스크롤할 수 있도록 감싸는 영역 */}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>요청 / TOOL</th>
              <th>결정</th>
              <th>실행 상태</th>
              <th>요청 시각</th>

              <th>
                {/* 화면에는 보이지 않지만 스크린 리더에 열의 의미를 제공 */}
                <span className="sr-only">상세 보기</span>
              </th>
            </tr>
          </thead>


          <tbody>
            {/* 실행 이력이 없을 경우 로딩 상태 또는 빈 상태 안내 */}
            {sortedRuns.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-table">
                  {loading
                    ? "실행 이력을 불러오고 있어요."
                    : "아직 실행한 요청이 없어요. 위에서 첫 검증을 시작하세요."}
                </td>
              </tr>
            ) : (

              /* 최신 실행 순서로 각 Run을 테이블 행으로 표시 */
              sortedRuns.map((run) => (
                <tr
                  key={run.id}

                  // 실행 결정별 스타일과 현재 선택된 Run 스타일을 함께 적용
                  className={`history-row decision-${run.decision.toLowerCase()} ${
                    selectedRun?.id === run.id ? "selected-row" : ""
                  }`}
                >
                  {/* 사용자가 입력한 요청과 실제 선택된 Tool 표시 */}
                  <td>
                    <strong className="request-title">
                      {run.prompt || run.toolId}
                    </strong>

                    <code className="tool-code">
                      {run.toolId}
                    </code>
                  </td>


                  {/* 최종 검증 결정: ALLOW / REVIEW / BLOCK */}
                  <td>
                    <Badge decision={run.decision} />
                  </td>


                  {/* 현재 Run의 실행 처리 상태 */}
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


                  {/* 화면에는 간단한 시간만 표시하고,
                      마우스를 올리면 전체 날짜와 시간을 확인할 수 있도록 title 제공 */}
                  <td
                    className="time-cell"
                    title={new Date(
                      run.createdAt,
                    ).toLocaleString("ko-KR")}
                  >
                    {time(run.createdAt)}
                  </td>


                  {/* 해당 Run의 검증 상세 결과 선택 */}
                  <td>
                    <button
                      className="detail-button"
                      onClick={() => {
                        // VerificationPanel에서 표시할 Run 변경
                        setSelectedId(run.id);

                        // 선택 후 검증 결과 패널 위치로 부드럽게 이동
                        document
                          .getElementById(
                            "verification-heading",
                          )
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}

                      // 화면을 보지 않고 사용하는 경우에도
                      // 어떤 실행의 상세 버튼인지 알 수 있도록 설명 제공
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