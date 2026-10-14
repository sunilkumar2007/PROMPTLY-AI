import OpenAI from "openai";

// Construct this only when the chat feature is actually called. An optional
// Lovable key must not crash server-function module loading for Gemini flows.
export function getAiGateway() {
  const apiKey = process.env["LOVABLE_API_KEY"] || "";
  if (!apiKey) {
    throw new Error(
      "LOVABLE_API_KEY is required for AI chat. Configure it on the server and restart Promptly.",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.lovable.ai/v1",
  });
}
