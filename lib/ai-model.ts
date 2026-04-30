const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-mini";

export type LlmConfig = {
  provider: string;
  model: string;
  apiKey: string;
};

export function getLlmConfigFromEnv(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER?.trim() || DEFAULT_PROVIDER).toLowerCase();
  const model = process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  return { provider, model, apiKey };
}
