import OpenAI from "openai";

// Model choices are centralized here. Override per deployment with env vars if a model id changes.
export const EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.4-nano";
export const REPLY_MODEL = process.env.OPENAI_REPLY_MODEL ?? "gpt-5.6-luna";

export function openaiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this deployment");
  return new OpenAI({ apiKey, timeout: 45_000, maxRetries: 2 });
}
