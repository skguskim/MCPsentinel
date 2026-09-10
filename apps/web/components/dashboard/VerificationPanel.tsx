import Icon from "@/components/common/Icon";
import Badge from "@/components/common/Badge";
import type { Run } from "@/types";
import { decisionDescriptions } from "@/lib/constants";

type VerificationPanelProps = {
  selectedRun: Run | null;
  busy: string | null;
  loading: boolean;
  statusNames: Record<string, string>;
  time: (value: string) => string;
  review: (action: "approve" | "reject") => void | Promise<void>;
};

export default function VerificationPanel({
  selectedRun,
  busy,
  loading,
  statusNames,
  time,
  review,
}: VerificationPanelProps) {
  return (
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

              <code className="decision-tool">
                {selectedRun.toolId}
              </code>
            </div>

            <Badge decision={selectedRun.decision} />
          </div>

          <div className="run-metadata">
            <span>
              REQUEST ID <code>{selectedRun.id.slice(0, 12)}</code>
            </span>

            <span>{time(selectedRun.createdAt)}</span>
          </div>
          <div className="verification-flow" aria-label="검증 흐름">
            <span className="flow-step">
                Registry
            </span>

            <Icon name="arrow" size={13} />

            <span className="flow-step">
                Integrity
            </span>

            <Icon name="arrow" size={13} />

            <span className="flow-step">
                Permission
            </span>

            <Icon name="arrow" size={13} />

            <span
                className={`flow-step decision ${selectedRun.decision.toLowerCase()}`}
            >
                {selectedRun.decision}
            </span>
          </div>
          <div className="checks">
            {selectedRun.checks.map((check) => (
              <div className="check-row" key={check.key}>
                <span
                  className={`check-icon ${
                    check.passed ? "green" : "red"
                  }`}
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
                  className={`check-state ${
                    check.passed ? "green" : "red"
                  }`}
                >
                  {check.passed ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>

          {selectedRun.reasons.length > 0 && (
            <div
                className={`reasons ${selectedRun.decision.toLowerCase()}`}
            >
                <div className="reasons-heading">
                <Icon
                    name={
                    selectedRun.decision === "BLOCK"
                        ? "shield"
                        : selectedRun.decision === "REVIEW"
                        ? "clock"
                        : "check"
                    }
                    size={15}
                />

                <strong>
                    {selectedRun.decision === "BLOCK"
                    ? "차단 사유"
                    : selectedRun.decision === "REVIEW"
                        ? "승인 필요 사유"
                        : "검증 결과"}
                </strong>
                </div>

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
              <div className="review-flow">
                <div className="review-step completed">
                    <span className="review-step-number">
                    <Icon name="check" size={12} />
                    </span>
                    <span>Tool 검증</span>
                </div>

                <span className="review-line" />

                <div className="review-step active">
                    <span className="review-step-number">2</span>
                    <span>사용자 승인</span>
                </div>

                <span className="review-line" />

                <div className="review-step">
                    <span className="review-step-number">3</span>
                    <span>Tool 실행</span>
                </div>
              </div> 
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
            <div className="inline-error">
              {selectedRun.error}
            </div>
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
  );
}