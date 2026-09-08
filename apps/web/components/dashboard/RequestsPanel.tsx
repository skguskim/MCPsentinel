import type { FormEvent } from "react";

import Icon from "@/components/common/Icon";
import type { Scenario } from "@/types";

type ScenarioOption = {
  id: Scenario;
  name: string;
  description: string;
};

type RequestPanelProps = {
  prompt: string;
  setPrompt: (value: string) => void;
  scenario: Scenario;
  scenarios: ScenarioOption[];
  busy: string | null;
  connected: boolean;
  registryMode: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  changeScenario: (scenario: Scenario) => void | Promise<void>;
};

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
              busy !== null ||
              !connected ||
              registryMode !== "demo"
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
          disabled={
            !prompt.trim() ||
            !connected ||
            busy !== null
          }
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
  );
}