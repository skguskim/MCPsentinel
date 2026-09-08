"use client";

import type {
  Decision,
  Run,
  Tool,
  Scenario,
  IconName,
} from "@/types";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    shield: (
      <>
        <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-4.6" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    cross: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    chain: (
      <>
        <path
          d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
          transform="translate(1 0) scale(.9 1)"
        />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string | { message?: string }; message?: string })
    | null;
  if (!response.ok) {
    const reason =
      typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message;
    throw new Error(
      reason ||
        payload?.message ||
        `요청을 처리하지 못했어요. (HTTP ${response.status})`,
    );
  }
  if (payload === null)
    throw new Error("서버에서 올바른 응답을 받지 못했어요.");
  return payload;
}

const scenarios: { id: Scenario; name: string; description: string }[] = [
  { id: "normal", name: "정상 Tool", description: "승인된 정보와 일치" },
  {
    id: "tampered",
    name: "Manifest 변조",
    description: "등록된 해시와 불일치",
  },
  { id: "revoked", name: "Tool 폐기", description: "등록 후 사용이 중단됨" },
  {
    id: "version-mismatch",
    name: "미승인 버전",
    description: "승인 버전과 불일치",
  },
  {
    id: "permission-denied",
    name: "금지 권한",
    description: "허용 범위를 벗어난 권한",
  },
  {
    id: "registry-unavailable",
    name: "Registry 장애",
    description: "신뢰 기준 조회 불가",
  },
];
const statusNames: Record<Run["status"], string> = {
  completed: "실행 완료",
  pending_review: "승인 대기",
  blocked: "실행 차단",
  rejected: "승인 거절",
  failed: "실행 실패",
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "요청 중 오류가 발생했어요.";
const time = (value: string) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

function Badge({ decision }: { decision: Decision }) {
  return (
    <span className={`badge ${decision.toLowerCase()}`}>
      <span className="status-dot" />
      {decision}
    </span>
  );
}

export default function Dashboard() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [registryMode, setRegistryMode] = useState<"demo" | "onchain" | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("달러 환율 알려줘");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [health, toolData, runData] = await Promise.allSettled([
        api<{
          status: string;
          registryMode: "demo" | "onchain";
          scenario?: Scenario;
        }>("/health"),
        api<{ tools: Tool[] }>("/tools"),
        api<{ runs: Run[] }>("/runs"),
      ]);
      setConnected(health.status === "fulfilled");
      if (health.status === "fulfilled") {
        setRegistryMode(health.value.registryMode);
        if (health.value.scenario) setScenario(health.value.scenario);
      }
      if (toolData.status === "fulfilled") setTools(toolData.value.tools);
      if (runData.status === "fulfilled") setRuns(runData.value.runs);
      const failure = [health, toolData, runData].find(
        (item) => item.status === "rejected",
      );
      if (failure?.status === "rejected") setError(errorText(failure.reason));
    } catch (err) {
      setConnected(false);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runs],
  );
  const selectedRun =
    sortedRuns.find((run) => run.id === selectedId) ?? sortedRuns[0];
  const completedCount = runs.filter(
    (run) => run.status === "completed",
  ).length;
  const blockedCount = runs.filter((run) => run.decision === "BLOCK").length;
  const reviewCount = runs.filter(
    (run) => run.status === "pending_review",
  ).length;

  function acceptRun(run: Run) {
    setRuns((previous) => [
      run,
      ...previous.filter((item) => item.id !== run.id),
    ]);
    setSelectedId(run.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy("run");
    setError(null);
    try {
      acceptRun(
        (await api<{ run: Run }>("/runs", { prompt: prompt.trim() })).run,
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function review(action: "approve" | "reject") {
    if (!selectedRun || busy) return;
    setBusy(action);
    setError(null);
    try {
      acceptRun(
        (
          await api<{ run: Run }>(
            `/runs/${encodeURIComponent(selectedRun.id)}/${action}`,
            {},
          )
        ).run,
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function changeScenario(nextScenario: Scenario) {
    if (busy || registryMode !== "demo") return;
    setBusy("scenario");
    setError(null);
    try {
      await api<{ scenario: Scenario }>("/demo/scenario", {
        scenario: nextScenario,
      });
      setScenario(nextScenario);
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-shell">
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
            Tool Registry<span className="nav-count">{tools.length}</span>
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
          <span className="outline-pill">OFF-CHAIN × ON-CHAIN</span>
        </div>
        <div className="sidebar-footer">
          <span className={`status-dot ${connected ? "green" : "muted"}`} />
          {connected ? "Gateway 연결됨" : "Gateway 연결 확인 중"}
        </div>
      </aside>

      <div className="main-shell">
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
        <main id="overview">
          <div className="page-heading">
            <div>
              <div className="eyebrow">MCP EXECUTION SECURITY</div>
              <h1>실행 전에, 신뢰부터.</h1>
              <p>
                Tool의 무결성과 권한을 검증하고 모든 실행 결정을 확인하세요.
              </p>
            </div>
            <div className="mode-pill">
              <Icon name="chain" size={16} />
              {registryMode === "onchain"
                ? "On-chain Registry"
                : registryMode === "demo"
                  ? "Demo Registry"
                  : "Registry 확인 중"}
              <span className="status-dot" />
            </div>
          </div>

          <div className="environment-note">
            <Icon name="spark" size={16} />
            <span>
              {registryMode === "onchain"
                ? "온체인 Registry를 조회합니다."
                : "데모 모드에서는 로컬 Registry로 검증 흐름을 체험합니다."}{" "}
              기본 요청 해석은 키워드 기반 데모 라우팅이며, 환율은 샘플
              데이터입니다.
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="cross" size={18} />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                aria-label="오류 알림 닫기"
              >
                <Icon name="cross" size={16} />
              </button>
            </div>
          )}

          <section className="stats-grid" aria-label="실행 통계">
            <Stat
              icon="box"
              label="등록된 Tool"
              value={loading ? "—" : tools.length}
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

          <div className="workbench-grid">
            <section
              className="panel request-panel"
              aria-labelledby="request-heading"
            >
              <div className="panel-heading">
                <div className="heading-icon blue">
                  <Icon name="spark" />
                </div>
                <div>
                  <h2 id="request-heading">새로운 실행 요청</h2>
                  <p>자연어 요청으로 검증 흐름을 시작하세요.</p>
                </div>
                <span className="step-label">01 / REQUEST</span>
              </div>
              <form onSubmit={submit}>
                <label className="field-label" htmlFor="prompt">
                  무엇을 실행할까요?
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="예: 달러 환율 알려줘"
                  maxLength={4000}
                  rows={4}
                  disabled={busy !== null}
                />
                <div className="presets">
                  <span>빠른 입력</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setPrompt("달러 환율 알려줘")}
                  >
                    달러 환율 조회 <Icon name="arrow" size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setPrompt("이번 주 보고서 업데이트해줘")}
                  >
                    보고서 업데이트 <Icon name="arrow" size={12} />
                  </button>
                </div>
                <div className="scenario-section">
                  <div className="section-label">
                    <label htmlFor="scenario">검증 시나리오</label>
                    <span>DEMO CONTROLS</span>
                  </div>
                  <select
                    id="scenario"
                    value={scenario}
                    onChange={(event) =>
                      void changeScenario(event.target.value as Scenario)
                    }
                    disabled={
                      busy !== null || !connected || registryMode !== "demo"
                    }
                  >
                    {scenarios.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.description}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    {registryMode === "onchain"
                      ? "온체인 모드에서는 데모 시나리오 변경이 비활성화됩니다."
                      : "시나리오를 변경한 뒤 실행하세요. 정상 모드의 보고서 쓰기는 승인이 필요합니다."}
                  </p>
                </div>
                <button
                  className="primary-button execute-button"
                  type="submit"
                  disabled={!prompt.trim() || !connected || busy !== null}
                >
                  {busy === "run" ? (
                    <>
                      <span className="spinner" />
                      검증하고 있어요
                    </>
                  ) : (
                    <>
                      <Icon name="shield" size={18} />
                      검증 후 실행
                      <Icon name="arrow" size={18} />
                    </>
                  )}
                </button>
                <p className="execution-note">
                  <Icon name="shield" size={12} /> 차단되거나 승인 대기 중인
                  요청은 실행되지 않습니다.
                </p>
              </form>
            </section>

            <section
              className="panel verification-panel"
              aria-labelledby="verification-heading"
              aria-live="polite"
            >
              <div className="panel-heading">
                <div className="heading-icon green">
                  <Icon name="shield" />
                </div>
                <div>
                  <h2 id="verification-heading">실시간 검증 결과</h2>
                  <p>선택한 요청의 실행 결정과 근거</p>
                </div>
                <span className="step-label">02 / VERIFY</span>
              </div>
              {selectedRun ? (
                <>
                  <div
                    className={`decision-summary ${selectedRun.decision.toLowerCase()}`}
                  >
                    <div className="decision-symbol">
                      <Icon
                        name={
                          selectedRun.decision === "ALLOW"
                            ? "check"
                            : selectedRun.decision === "REVIEW"
                              ? "clock"
                              : "shield"
                        }
                        size={25}
                      />
                    </div>
                    <div>
                      <div className="decision-title">
                        {statusNames[selectedRun.status]}
                      </div>
                      <div className="decision-subtitle">
                        {selectedRun.toolId}
                      </div>
                    </div>
                    <Badge decision={selectedRun.decision} />
                  </div>
                  <div className="run-metadata">
                    <span>
                      REQUEST ID <code>{selectedRun.id.slice(0, 12)}</code>
                    </span>
                    <span>{time(selectedRun.createdAt)}</span>
                  </div>
                  <div className="checks">
                    {selectedRun.checks.map((check) => (
                      <div className="check-row" key={check.key}>
                        <span
                          className={`check-icon ${check.passed ? "green" : "red"}`}
                        >
                          <Icon
                            name={check.passed ? "check" : "cross"}
                            size={13}
                          />
                        </span>
                        <div>
                          <strong>{check.label}</strong>
                          <p>{check.detail}</p>
                        </div>
                        <span
                          className={`check-state ${check.passed ? "green" : "red"}`}
                        >
                          {check.passed ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedRun.reasons.length > 0 && (
                    <div className="reasons">
                      {selectedRun.reasons.map((reason, index) => (
                        <p key={`${index}-${reason}`}>{reason}</p>
                      ))}
                    </div>
                  )}
                  {selectedRun.status === "pending_review" && (
                    <div className="review-box">
                      <strong>이 요청의 실행을 승인할까요?</strong>
                      <p>
                        승인은 이 Tool과 실행 인자에만 적용됩니다. 실행 직전에
                        상태를 다시 검증합니다.
                      </p>
                      <details>
                        <summary>실행 인자 확인</summary>
                        <pre>
                          {JSON.stringify(selectedRun.arguments, null, 2)}
                        </pre>
                      </details>
                      <div className="review-actions">
                        <button
                          className="secondary-button"
                          disabled={busy !== null}
                          onClick={() => void review("reject")}
                        >
                          {busy === "reject" ? "거절 중…" : "거절"}
                        </button>
                        <button
                          className="primary-button"
                          disabled={busy !== null}
                          onClick={() => void review("approve")}
                        >
                          {busy === "approve" ? "재검증 중…" : "승인 후 실행"}
                          <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedRun.result !== undefined && (
                    <div className="result-box">
                      <div className="section-label">
                        <span>TOOL RESPONSE</span>
                        <span className="green">실행 결과</span>
                      </div>
                      <pre>
                        {typeof selectedRun.result === "string"
                          ? selectedRun.result
                          : JSON.stringify(selectedRun.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedRun.error && (
                    <div className="inline-error">{selectedRun.error}</div>
                  )}
                </>
              ) : (
                <div className="empty-verification">
                  <div className="radar">
                    <div className="radar-inner">
                      <Icon name="shield" size={37} />
                    </div>
                    <span className="radar-point" />
                  </div>
                  <h3>
                    {loading
                      ? "Gateway에 연결하고 있어요"
                      : "첫 번째 요청을 기다리고 있어요"}
                  </h3>
                  <p>
                    왼쪽에서 요청을 실행하면
                    <br />
                    검증 항목과 실행 결과가 여기에 표시됩니다.
                  </p>
                  <div className="pipeline">
                    <span>요청</span>
                    <Icon name="arrow" size={13} />
                    <span className="pipeline-focus">신뢰 검증</span>
                    <Icon name="arrow" size={13} />
                    <span>Tool 실행</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section
            className="panel history-panel"
            id="history"
            aria-labelledby="history-heading"
          >
            <div className="table-heading">
              <div>
                <h2 id="history-heading">
                  실행 이력 <span className="heading-count">{runs.length}</span>
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
                <span>{busy === "refresh" ? "불러오는 중" : "새로고침"}</span>
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
                        className={
                          selectedRun?.id === run.id ? "selected-row" : ""
                        }
                      >
                        <td>
                          <strong className="request-title">
                            {run.prompt || run.toolId}
                          </strong>
                          <code className="tool-code">{run.toolId}</code>
                        </td>
                        <td>
                          <Badge decision={run.decision} />
                        </td>
                        <td>
                          <span
                            className={`run-status ${run.status === "completed" ? "green" : ""}`}
                          >
                            {statusNames[run.status]}
                          </span>
                        </td>
                        <td
                          className="time-cell"
                          title={new Date(run.createdAt).toLocaleString(
                            "ko-KR",
                          )}
                        >
                          {time(run.createdAt)}
                        </td>
                        <td>
                          <button
                            className="detail-button"
                            onClick={() => {
                              setSelectedId(run.id);
                              document
                                .getElementById("verification-heading")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }}
                            aria-label={`${run.toolId} ${time(run.createdAt)} 검증 상세 보기`}
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
                        className={`tool-state ${tool.revoked ? "red" : tool.approved ? "green" : "amber"}`}
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
                      <span>v{tool.version.replace(/^v/, "")}</span>
                    </div>
                    <div className="permission-tags">
                      {tool.permissions.map((permission) => (
                        <span key={permission}>{permission}</span>
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

          <footer className="main-footer">
            <span>
              <Icon name="shield" size={14} /> MCP Sentinel
            </span>
            <p>
              Manifest 무결성 검증은 원격 서버의 실제 코드나 동작 검증을
              의미하지 않습니다.
            </p>
            <span>BUILD WITH TRUST</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  detail: string;
  tone: string;
}) {
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
