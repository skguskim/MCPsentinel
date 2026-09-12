import type { FormEvent } from "react";

import Icon from "@/components/common/Icon";
import type { Scenario } from "@/types";

/**
 * 하나의 데모 검증 시나리오를 표현하는 UI 옵션
 */
type ScenarioOption = {
  // 실제 시나리오 식별값
  id: Scenario;

  // 사용자에게 표시할 시나리오 이름
  name: string;

  // 해당 시나리오에 대한 간단한 설명
  description: string;
};

/**
 * RequestPanel에서 필요한 상태와 이벤트 함수
 *
 * 실제 상태는 상위 Dashboard에서 관리하고,
 * RequestPanel은 전달받은 값을 표시하고 사용자 입력을 상위로 전달한다.
 */
type RequestPanelProps = {
  // 사용자가 입력한 자연어 실행 요청
  prompt: string;

  // 자연어 요청 입력값을 변경하는 함수
  setPrompt: (value: string) => void;

  // 현재 선택된 데모 검증 시나리오
  scenario: Scenario;

  // 사용 가능한 전체 데모 시나리오 목록
  scenarios: ScenarioOption[];

  // 현재 진행 중인 비동기 작업
  busy: string | null;

  // MCP Sentinel 백엔드 연결 상태
  connected: boolean;

  // 현재 Registry 실행 모드
  registryMode: string | null;

  // 실행 요청 Form 제출 처리 함수
  submit: (event: FormEvent<HTMLFormElement>) => void;

  // 데모 검증 시나리오 변경 함수
  changeScenario: (scenario: Scenario) => void | Promise<void>;
};

/**
 * 새로운 Tool 실행 요청을 입력하는 Dashboard 패널
 *
 * 사용자는 자연어 요청을 직접 입력하거나 빠른 입력 버튼을 사용할 수 있으며,
 * Demo Registry 환경에서는 보안 검증 시나리오를 선택할 수 있다.
 *
 * 실제 Tool 실행 로직은 상위 Dashboard에서 처리하고,
 * 이 컴포넌트는 입력 및 UI 이벤트를 담당한다.
 */
export default function RequestPanel({
  prompt,
  setPrompt,
  scenario,
  scenarios,
  busy,
  connected,
  registryMode,
  submit,
  changeScenario,
}: RequestPanelProps) {
  return (
    <section className="panel request-panel" aria-labelledby="request-heading">
      {/* 패널 제목 및 실행 단계 표시 */}
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

      {/* 자연어 실행 요청 Form */}
      <form onSubmit={submit}>
        {/* 사용자가 직접 자연어 요청을 입력하는 영역 */}
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
          // 실행 또는 다른 작업이 진행 중일 때 입력 변경 방지
          disabled={busy !== null}
        />

        {/* 데모에서 자주 사용하는 요청을 빠르게 입력하는 버튼 */}
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

          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              setPrompt("공식 환율 데이터를 가져와 보고서 업데이트 해줘")
            }
          >
            환율 조회 + 보고서 업데이트 <Icon name="arrow" size={12} />
          </button>
        </div>

        {/* Demo Registry에서 검증 상황을 선택하는 영역 */}
        <div className="scenario-section">
          <div className="section-label">
            <label htmlFor="scenario">검증 시나리오</label>
            <span>DEMO CONTROLS</span>
          </div>

          {/* 시나리오를 카드 형태의 버튼으로 빠르게 선택 */}
          <div className="scenario-presets">
            {scenarios.map((item) => (
              <button
                key={item.id}
                type="button"
                // 현재 시나리오와 일치하는 버튼에 active 클래스 적용
                className={`scenario-button scenario-${item.id} ${
                  scenario === item.id ? "active" : ""
                }`}
                // 서버 연결이 없거나 Demo Registry가 아니면 변경 불가
                disabled={
                  busy !== null || !connected || registryMode !== "demo"
                }
                onClick={() => void changeScenario(item.id)}
              >
                <span className="scenario-button-title">
                  <span className="scenario-indicator" />
                  {item.name}
                </span>

                <span className="scenario-button-description">
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          {/* 동일한 시나리오 목록을 Select 형태로도 제공 */}
          <select
            id="scenario"
            value={scenario}
            onChange={(event) =>
              void changeScenario(event.target.value as Scenario)
            }
            disabled={busy !== null || !connected || registryMode !== "demo"}
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.description}
              </option>
            ))}
          </select>

          {/* Registry 모드에 따른 시나리오 사용 안내 */}
          <p className="field-hint">
            {registryMode === "onchain"
              ? "온체인 모드에서는 데모 시나리오 변경이 비활성화됩니다."
              : "시나리오를 변경한 뒤 실행하세요. 정상 모드의 보고서 쓰기는 승인이 필요합니다."}
          </p>
        </div>

        {/* 자연어 요청을 MCP Sentinel 검증 흐름으로 전달 */}
        <button
          className="primary-button execute-button"
          type="submit"
          // 요청이 비어있거나 서버 연결이 없거나
          // 다른 작업이 진행 중이면 실행 버튼 비활성화
          disabled={!prompt.trim() || !connected || busy !== null}
        >
          {busy === "run" ? (
            <>
              {/* 실행 요청 처리 중 표시 */}
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

        {/* MCP Sentinel 실행 정책 안내 */}
        <p className="execution-note">
          <Icon name="shield" size={12} /> 차단되거나 승인 대기 중인 요청은
          실행되지 않습니다.
        </p>
      </form>
    </section>
  );
}
