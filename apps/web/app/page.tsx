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

import { api } from "@/lib/api";
import Icon from "@/components/common/Icon";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import RequestPanel from "@/components/dashboard/RequestsPanel";
import VerificationPanel from "@/components/dashboard/VerificationPanel";
import Badge from "@/components/common/Badge";

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
      <Sidebar
      toolsCount={tools.length}
      connected={connected}
      />
      <div className="main-shell">
        <Topbar connected={connected} />
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
          <StatsGrid
            loading={loading}
            toolsCount={tools.length}
            completedCount={completedCount}
            blockedCount={blockedCount}
            reviewCount={reviewCount}
          />
          <div className="workbench-grid">
          <RequestPanel
            prompt={prompt}
            setPrompt={setPrompt}
            scenario={scenario}
            scenarios={scenarios}
            busy={busy}
            connected={connected}
            registryMode={registryMode}
            submit={submit}
            changeScenario={changeScenario}
          />
          <VerificationPanel
            selectedRun={selectedRun}
            busy={busy}
            loading={loading}
            statusNames={statusNames}
            time={time}
            review={review}
          />
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