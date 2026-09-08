export type Decision = "ALLOW" | "REVIEW" | "BLOCK";
export type Run = {
  id: string;
  toolId: string;
  arguments: Record<string, unknown>;
  prompt?: string;
  decision: Decision;
  status: "completed" | "pending_review" | "blocked" | "rejected" | "failed";
  checks: { key: string; label: string; passed: boolean; detail: string }[];
  reasons: string[];
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
export type Tool = {
  toolId: string;
  name: string;
  description: string;
  version: string;
  publisher: string;
  permissions: string[];
  approved: boolean;
  revoked: boolean;
};
export type Scenario =
  | "normal"
  | "tampered"
  | "revoked"
  | "version-mismatch"
  | "permission-denied"
  | "registry-unavailable";
export type IconName =
  | "shield"
  | "grid"
  | "box"
  | "history"
  | "arrow"
  | "check"
  | "cross"
  | "clock"
  | "chain"
  | "refresh"
  | "spark";