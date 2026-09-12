export type AgentDecision =
  | {
      type: "answer";
      content: string;
    }
  | {
      type: "tool_call";
      toolId: string;
      toolName: string;
      arguments: Record<string, unknown>;
    };

export interface ToolExecutionContext {
  userPrompt: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
}