import test from "node:test";
import assert from "node:assert/strict";
import { ArtifactEngine } from "../src/lib/artifact-engine.ts";

test("generated source blocks become named code artifacts", () => {
  const output = "```typescript filepath=src/health.ts\nexport const health = () => 'ok';\n```";
  const files = ArtifactEngine.extractArtifactsFromOutput(1, "Health check", output);
  assert.equal(files.length, 1);
  assert.equal(files[0].filePath, "src/health.ts");
  assert.equal(files[0].content, "export const health = () => 'ok';");
});

test("unsafe generated paths are excluded from artifacts and project exports", () => {
  const output = "```ts filepath=../../outside.ts\nexport const secret = true;\n```";
  assert.deepEqual(ArtifactEngine.extractArtifactsFromOutput(1, "Unsafe", output), []);
});
