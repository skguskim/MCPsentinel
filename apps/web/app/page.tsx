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

/**
 * MCP Sentinel 메인 대시보드
 *
 * Tool 목록, 실행 이력, Registry 상태를 조회하고
 * 사용자의 실행 요청 및 검증 결과를 각 UI 컴포넌트에 전달한다.
 */
export default function Dashboard() {

  /* ==============================
     Dashboard State
     ============================== */

  // Registry에 등록된 Tool 목록
  const [tools, setTools] = useState<Tool[]>([]);

  // MCP Sentinel을 통해 처리된 Tool 실행 이력
  const [runs, setRuns] = useState<Run[]>([]);

  // 현재 Registry 동작 모드
  // demo: 로컬 데모 Registry / onchain: 블록체인 Registry
  const [registryMode, setRegistryMode] = useState<"demo" | "onchain" | null>(
    null,
  );

  // MCP Sentinel 백엔드 연결 상태
  const [connected, setConnected] = useState(false);

  // 대시보드 최초 데이터 로딩 상태
  const [loading, setLoading] = useState(true);

  // 현재 진행 중인 비동기 작업
  // run, approve, reject, scenario, refresh 등의 중복 실행 방지에 사용
  const [busy, setBusy] = useState<string | null>(null);

  // API 요청 또는 서버 연결 과정에서 발생한 오류 메시지
  const [error, setError] = useState<string | null>(null);

  // 사용자가 입력한 자연어 Tool 실행 요청
  const [prompt, setPrompt] = useState("달러 환율 알려줘");

  // 데모 Registry에서 사용할 보안 검증 시나리오
  const [scenario, setScenario] = useState<Scenario>("normal");

  // 실행 이력 중 현재 상세 화면에 표시할 Run ID
  const [selectedId, setSelectedId] = useState<string | null>(null);


  /* ==============================
     Dashboard Data
     ============================== */

  /**
   * 대시보드에 필요한 서버 상태를 갱신한다.
   *
   * health : 서버 연결 상태 및 Registry 모드
   * tools  : Registry에 등록된 Tool 목록
   * runs   : Tool 실행 이력
   *
   * 일부 요청이 실패하더라도 성공한 데이터는 화면에 반영하기 위해
   * Promise.allSettled를 사용한다.
   */
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

      // health 요청 성공 여부를 서버 연결 상태로 사용
      setConnected(health.status === "fulfilled");

      // Registry 모드 및 현재 데모 시나리오 반영
      if (health.status === "fulfilled") {
        setRegistryMode(health.value.registryMode);
        if (health.value.scenario) setScenario(health.value.scenario);
      }

      // 성공적으로 조회된 데이터만 각각 상태에 반영
      if (toolData.status === "fulfilled") setTools(toolData.value.tools);
      if (runData.status === "fulfilled") setRuns(runData.value.runs);

      // 병렬 요청 중 하나라도 실패한 경우 첫 번째 오류를 사용자에게 표시
      const failure = [health, toolData, runData].find(
        (item) => item.status === "rejected",
      );

      if (failure?.status === "rejected") {
        setError(errorText(failure.reason));
      }
    } catch (err) {
      setConnected(false);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);


  /* ==============================
     Initial Load
     ============================== */

  // 대시보드 최초 렌더링 시 서버 데이터를 한 번 조회
  useEffect(() => {
    void refresh();
  }, [refresh]);


  /* ==============================
     Derived Data
     ============================== */

  // 최신 실행이 위에 표시되도록 생성 시간을 기준으로 실행 이력을 정렬
  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runs],
  );

  // 사용자가 선택한 실행 이력을 상세 검증 패널에 표시
  // 별도 선택이 없으면 가장 최근 실행을 기본값으로 사용
  const selectedRun =
    sortedRuns.find((run) => run.id === selectedId) ?? sortedRuns[0];

  // 상단 통계 카드에 표시할 실행 상태별 개수
  const completedCount = runs.filter(
    (run) => run.status === "completed",
  ).length;

  const blockedCount = runs.filter(
    (run) => run.decision === "BLOCK",
  ).length;

  const reviewCount = runs.filter(
    (run) => run.status === "pending_review",
  ).length;


  /* ==============================
     Run State Update
     ============================== */

  /**
   * 새로 생성되거나 상태가 변경된 Run을 실행 이력에 반영한다.
   * 동일한 Run이 이미 존재하면 기존 항목을 제거하고 최신 상태를 맨 앞에 배치한다.
   */
  function acceptRun(run: Run) {
    setRuns((previous) => [
      run,
      ...previous.filter((item) => item.id !== run.id),
    ]);

    // 처리된 Run을 검증 상세 화면에서 바로 확인할 수 있도록 선택
    setSelectedId(run.id);
  }


  /* ==============================
     Tool Execution
     ============================== */

  /**
   * 사용자의 자연어 요청을 서버에 전달하여
   * Tool 선택 → 보안 검증 → 실행 판단 흐름을 시작한다.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 빈 요청 또는 이미 다른 작업이 진행 중이면 실행하지 않음
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


  /* ==============================
     REVIEW Decision
     ============================== */

  /**
   * REVIEW 상태의 실행 요청을 사용자가 승인하거나 거절한다.
   * 처리 결과로 반환된 최신 Run 상태를 실행 이력에 반영한다.
   */
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


  /* ==============================
     Demo Scenario
     ============================== */

  /**
   * 데모 모드에서 검증 시나리오를 변경한다.
   * 시나리오 변경 후 서버 상태를 다시 조회하여 Dashboard를 동기화한다.
   */
  async function changeScenario(nextScenario: Scenario) {
    // 실제 On-chain Registry에서는 데모 시나리오를 변경하지 않음
    if (busy || registryMode !== "demo") return;

    setBusy("scenario");
    setError(null);

    try {
      await api<{ scenario: Scenario }>("/demo/scenario", {
        scenario: nextScenario,
      });

      setScenario(nextScenario);

      // 변경된 Registry 상태를 다시 조회
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }


  /* ==============================
     Dashboard UI
     ============================== */

  return (
    <div className="app-shell">
      {/* 좌측 네비게이션 및 서버 연결 상태 */}
      <Sidebar
        toolsCount={tools.length}
        connected={connected}
      />

      <div className="main-shell">
        {/* 상단 Workspace 헤더 */}
        <Topbar connected={connected} />

        <main id="overview">

          {/* 대시보드 제목 및 현재 Registry 모드 */}
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

          {/* 현재 Registry 환경 및 데모 동작 방식 안내 */}
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

          {/* API 또는 서버 연결 오류 표시 */}
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

          {/* 등록 Tool 및 실행 결과 요약 통계 */}
          <StatsGrid
            loading={loading}
            toolsCount={tools.length}
            completedCount={completedCount}
            blockedCount={blockedCount}
            reviewCount={reviewCount}
          />

          {/* 실행 요청 입력 + 선택된 Run의 실시간 검증 결과 */}
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

          {/* 전체 Tool 실행 이력 */}
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

          {/* Registry에 등록된 Tool 목록 */}
          <ToolRegistry
            tools={tools}
            loading={loading}
            registryMode={registryMode}
          />

          {/* 프로젝트 및 검증 범위 안내 */}
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