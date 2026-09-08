"use client";

import type {
  Run,
  Tool,
  Scenario,
} from "@/types";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { api } from "@/lib/api";
import { scenarios, statusNames } from "@/lib/constants";
import { errorText, time } from "@/lib/formats";

import Icon from "@/components/common/Icon";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import RequestPanel from "@/components/dashboard/RequestsPanel";
import VerificationPanel from "@/components/dashboard/VerificationPanel";
import RunHistory from "@/components/dashboard/RunHistory";
import ToolRegistry from "@/components/dashboard/ToolRegistry";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
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
          <RunHistory
            runs={runs}
            sortedRuns={sortedRuns}
            selectedRun={selectedRun}
            loading={loading}
            busy={busy}
            statusNames={statusNames}
            time={time}
            refresh={refresh}
            setBusy={setBusy}
            setError={setError}
            setSelectedId={setSelectedId}
          />
          <ToolRegistry
            tools={tools}
            loading={loading}
            registryMode={registryMode}
          />
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