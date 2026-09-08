import type { Decision } from "@/types";

type BadgeProps = {
  decision: Decision;
};

export default function Badge({ decision }: BadgeProps) {
  return (
    <span className={`badge ${decision.toLowerCase()}`}>
      <span className="status-dot" />
      {decision}
    </span>
  );
}