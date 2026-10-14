import test from "node:test";
import assert from "node:assert/strict";
import { extractGeminiText } from "../src/lib/ai-providers.catalog.ts";

test("Gemini response parser collects text from every content part", () => {
  assert.equal(
    extractGeminiText({
      candidates: [
        { content: { parts: [{ text: "First part" }, { text: "Second part" }] } },
      ],
    }),
    "First part\nSecond part",
  );
});

test("Gemini response parser safely returns empty when the provider returns no text", () => {
  assert.equal(extractGeminiText({ candidates: [] }), "");
  assert.equal(
    extractGeminiText({
      candidates: [{ content: { parts: [{ inlineData: { data: "not text" } }] } }],
    }),
    "",
  );
});
