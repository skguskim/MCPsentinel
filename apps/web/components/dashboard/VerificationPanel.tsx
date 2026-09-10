import Icon from "@/components/common/Icon";
import Badge from "@/components/common/Badge";
import type { Run } from "@/types";
import { decisionDescriptions } from "@/lib/constants";

/**
 * VerificationPanel에서 사용하는 Props
 *
 * 선택된 실행 기록과 현재 처리 상태를 받아
 * 검증 결과, 승인 흐름, 실행 결과를 화면에 표시한다.
 */
type VerificationPanelProps = {
  // 현재 실행 이력에서 선택된 Run
  selectedRun: Run | null;

  // 현재 진행 중인 비동기 작업
  busy: string | null;

  // 최초 데이터 로딩 여부
  loading: boolean;

  // Run status를 사용자용 문자열로 변환하는 상태명 목록
  statusNames: Record<string, string>;

  // 서버 시간 문자열을 화면 표시용 시간으로 변환하는 함수
  time: (value: string) => string;

  // REVIEW 상태의 요청을 승인하거나 거절하는 함수
  review: (action: "approve" | "reject") => void | Promise<void>;
};

/**
 * MCP Sentinel의 실시간 검증 결과를 표시하는 패널
 *
 * 선택된 Run을 기준으로 최종 결정(ALLOW / REVIEW / BLOCK),
 * 개별 검증 항목, 판단 사유, 사용자 승인 절차,
 * Tool 실행 결과를 보여준다.
 */
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
      // 검증 결과가 변경되면 보조 기술에서 변경 내용을 인식할 수 있도록 설정
      aria-live="polite"
    >
      {/* 패널 제목 및 현재 검증 단계 표시 */}
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

      {/* 선택된 실행 기록이 있을 경우 검증 결과 표시 */}
      {selectedRun ? (
        <>
          {/* 최종 실행 결정 요약 */}
          <div
            className={`decision-summary ${selectedRun.decision.toLowerCase()}`}
          >
            <div className="decision-symbol">
              <Icon
                // 실행 결정에 따라 서로 다른 상태 아이콘 표시
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
              {/* 현재 Run의 실행 상태 */}
              <div className="decision-title">
                {statusNames[selectedRun.status]}
              </div>

              {/* 검증 대상 Tool ID */}
              <div className="decision-subtitle">{selectedRun.toolId}</div>

              <code className="decision-tool">{selectedRun.toolId}</code>
            </div>

            {/* ALLOW / REVIEW / BLOCK Badge */}
            <Badge decision={selectedRun.decision} />
          </div>

          {/* Run 식별 정보 및 요청 생성 시각 */}
          <div className="run-metadata">
            <span>
              REQUEST ID <code>{selectedRun.id.slice(0, 12)}</code>
            </span>

            <span>{time(selectedRun.createdAt)}</span>
          </div>

          {/* MCP Sentinel의 전체 신뢰 검증 흐름 */}
          <div className="verification-flow" aria-label="검증 흐름">
            <span className="flow-step">Registry</span>

            <Icon name="arrow" size={13} />

            <span className="flow-step">Integrity</span>

            <Icon name="arrow" size={13} />

            <span className="flow-step">Permission</span>

            <Icon name="arrow" size={13} />

            {/* 마지막 단계는 실제 실행 결정에 따라 색상과 텍스트 변경 */}
            <span
              className={`flow-step decision ${selectedRun.decision.toLowerCase()}`}
            >
              {selectedRun.decision}
            </span>
          </div>

          {/* Registry, 무결성, 권한 등의 개별 검증 결과 */}
          <div className="checks">
            {selectedRun.checks.map((check) => (
              <div className="check-row" key={check.key}>
                {/* 검증 성공 여부를 아이콘으로 표시 */}
                <span
                  className={`check-icon ${check.passed ? "green" : "red"}`}
                >
                  <Icon name={check.passed ? "check" : "cross"} size={13} />
                </span>

                {/* 검증 항목 이름과 상세 결과 */}
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>

                {/* 검증 결과를 PASS / FAIL 형태로 표시 */}
                <span
                  className={`check-state ${check.passed ? "green" : "red"}`}
                >
                  {check.passed ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>

          {/* 서버가 판단 사유를 제공한 경우에만 표시 */}
          {selectedRun.reasons.length > 0 && (
            <div className={`reasons ${selectedRun.decision.toLowerCase()}`}>
              <div className="reasons-heading">
                {/* 최종 결정에 맞는 아이콘 사용 */}
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

                {/* 결정 유형에 따라 사유 영역 제목 변경 */}
                <strong>
                  {selectedRun.decision === "BLOCK"
                    ? "차단 사유"
                    : selectedRun.decision === "REVIEW"
                      ? "승인 필요 사유"
                      : "검증 결과"}
                </strong>
              </div>

              {/* 서버가 반환한 판단 사유 목록 */}
              {selectedRun.reasons.map((reason, index) => (
                <p key={`${index}-${reason}`}>{reason}</p>
              ))}
            </div>
          )}

          {/* REVIEW 상태인 경우에만 사용자 승인 UI 표시 */}
          {selectedRun.status === "pending_review" && (
            <div className="review-box">
              <strong>이 요청의 실행을 승인할까요?</strong>

              <p>
                승인은 이 Tool과 실행 인자에만 적용됩니다. 실행 직전에 상태를
                다시 검증합니다.
              </p>

              {/* 사용자가 승인 전에 실제 Tool 실행 인자를 확인할 수 있도록 제공 */}
              <details>
                <summary>실행 인자 확인</summary>

                <pre>{JSON.stringify(selectedRun.arguments, null, 2)}</pre>
              </details>

              {/* REVIEW 실행 과정:
                  Tool 검증 → 사용자 승인 → Tool 실행 */}
              <div className="review-flow">
                <div className="review-step completed">
                  <span className="review-step-number">
                    <Icon name="check" size={12} />
                  </span>

                  <span>Tool 검증</span>
                </div>

                <span className="review-line" />

                {/* 현재 사용자가 처리해야 하는 승인 단계 */}
                <div className="review-step active">
                  <span className="review-step-number">2</span>
                  <span>사용자 승인</span>
                </div>

                <span className="review-line" />

                {/* 승인이 완료된 이후 진행될 Tool 실행 단계 */}
                <div className="review-step">
                  <span className="review-step-number">3</span>
                  <span>Tool 실행</span>
                </div>
              </div>

              {/* REVIEW 요청 승인 / 거절 버튼 */}
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

          {/* Tool 실행 결과가 존재하는 경우 응답 내용 표시 */}
          {selectedRun.result !== undefined && (
            <div className="result-box">
              <div className="section-label">
                <span>TOOL RESPONSE</span>
                <span className="green">실행 결과</span>
              </div>

              <pre>
                {/* 문자열은 그대로 표시하고 객체 등의 값은 보기 좋은 JSON으로 변환 */}
                {typeof selectedRun.result === "string"
                  ? selectedRun.result
                  : JSON.stringify(selectedRun.result, null, 2)}
              </pre>
            </div>
          )}

          {/* 특정 Run 실행 과정에서 오류가 발생한 경우 표시 */}
          {selectedRun.error && (
            <div className="inline-error">{selectedRun.error}</div>
          )}
        </>
      ) : (
        /* 아직 실행 이력이 없을 때 표시하는 초기 상태 */
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

          {/* 사용자가 앞으로 경험하게 될 기본 실행 흐름 안내 */}
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
