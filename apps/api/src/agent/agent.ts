import type OpenAI from "openai";

import { ToolConnection } from "../mcp.js";
import { getLLMClient, getLLMModel } from "./llm.js";
import type { AgentDecision, ToolExecutionContext } from "./types.js";

export class MCPAgent {
  constructor(private readonly connection: ToolConnection) {}

  async decide(prompt: string): Promise<AgentDecision> {
    const manifests = await this.connection.manifests();
    const mcpClient = await this.connection.connect();

    try {
      const listed = await mcpClient.listTools({}, { timeout: 5000 });

      // MCP Server가 실제 제공하면서 Manifest도 존재하는 Tool만
      // LLM에게 노출한다.
      const availableTools = listed.tools.filter((tool) =>
        manifests.some((manifest) => manifest.name === tool.name),
      );

      const manifestByName = new Map(
        manifests.map((manifest) => [manifest.name, manifest]),
      );

      const tools: OpenAI.Responses.FunctionTool[] = availableTools.map(
        (tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description || `MCP Tool named ${tool.name}`,
          parameters: tool.inputSchema as Record<string, unknown>,
          strict: false,
        }),
      );

      const llm = getLLMClient();

      const response = await llm.responses.create({
        model: getLLMModel(),

        instructions: [
          "You are the AI agent for MCP Sentinel.",
          "Answer ordinary informational questions directly when no MCP tool is needed.",

          "When the user asks to perform an action that matches an available MCP tool, prefer using that tool instead of only describing what could be done.",

          "If the user asks to create, update, or save a report and the update_report tool is available, request that tool.",

          "When reasonable tool arguments can be inferred from the user's request, infer them instead of asking unnecessary follow-up questions.",

          "For update_report, if no explicit title is provided, create a short title from the user's request. If no separate content is provided, use a concise description of the user's requested report update as the content.",

          "Only ask a follow-up question when a required argument cannot reasonably be inferred.",

          "Never invent a tool that is not in the provided tool list.",
          "Never execute a tool yourself.",
          "Only request the tool call. MCP Sentinel will independently decide whether execution is allowed.",
          "Respond in the same language as the user.",
        ].join(" "),

        input: prompt,

        tools,

        tool_choice: "auto",
        parallel_tool_calls: false,
      });

      const functionCall = response.output.find(
        (item) => item.type === "function_call",
      );

      // Tool 호출이 없으면 일반 LLM 답변
      if (!functionCall || functionCall.type !== "function_call") {
        const content = response.output_text.trim();

        if (!content) {
          throw new Error("LLM이 비어 있는 응답을 반환했습니다.");
        }

        return {
          type: "answer",
          content,
        };
      }

      // LLM이 실제 제공되지 않은 Tool을 생성했는지 한 번 더 확인
      const manifest = manifestByName.get(functionCall.name);

      if (
        !manifest ||
        !availableTools.some((tool) => tool.name === functionCall.name)
      ) {
        throw new Error(
          `LLM이 사용할 수 없는 Tool을 선택했습니다: ${functionCall.name}`,
        );
      }

      let parsedArguments: unknown;

      try {
        parsedArguments = JSON.parse(functionCall.arguments);
      } catch {
        throw new Error(
          `LLM이 잘못된 arguments JSON을 반환했습니다: ${functionCall.arguments}`,
        );
      }

      if (
        typeof parsedArguments !== "object" ||
        parsedArguments === null ||
        Array.isArray(parsedArguments)
      ) {
        throw new Error("LLM Tool arguments는 JSON object여야 합니다.");
      }

      return {
        type: "tool_call",
        toolId: manifest.toolId,
        toolName: functionCall.name,
        arguments: parsedArguments as Record<string, unknown>,
      };
    } finally {
      await mcpClient.close().catch(() => {});
    }
  }

  async finalizeToolResult(context: ToolExecutionContext): Promise<string> {
    const llm = getLLMClient();

    const response = await llm.responses.create({
      model: getLLMModel(),

      instructions: [
        "You are the AI agent for MCP Sentinel.",
        "A tool was requested by the user and has already passed the MCP Sentinel security gateway.",
        "Use the supplied tool result to answer the original user request.",
        "Do not claim actions that are not present in the tool result.",
        "Respond naturally and concisely in the user's language.",
      ].join(" "),

      input: [
        `Original user request:\n${context.userPrompt}`,
        `Executed MCP tool:\n${context.toolName}`,
        `Tool arguments:\n${JSON.stringify(context.arguments)}`,
        `Tool result:\n${JSON.stringify(context.result)}`,
      ].join("\n\n"),
    });

    const content = response.output_text.trim();

    if (!content) {
      throw new Error("Tool 결과에 대한 LLM 최종 응답이 비어 있습니다.");
    }

    return content;
  }
}
