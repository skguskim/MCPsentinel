import OpenAI from "openai";

let client: OpenAI | undefined;

export function getLLMClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY가 설정되지 않았습니다. 루트 .env 파일을 확인해주세요.",
    );
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL:
        process.env.LLM_BASE_URL ||
        "https://openrouter.ai/api/v1",
    });
  }

  return client;
}

export function getLLMModel(): string {
  return process.env.LLM_MODEL || "openrouter/free";
}