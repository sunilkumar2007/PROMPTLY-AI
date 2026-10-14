import test from "node:test";
import assert from "node:assert/strict";
import {
  applyReviewedWorkspaceFiles,
  parseGeneratedWorkspaceFiles,
  readRepositoryContext,
  reviewGeneratedWorkspaceFiles,
  validateWorkspacePath,
} from "../src/lib/local-code-workspace.ts";

function mockDirectory(name = "workspace", tree = new Map()) {
  return {
    name,
    async getDirectoryHandle(child, options) {
      if (!tree.has(child)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        tree.set(child, mockDirectory(child));
      }
      const value = tree.get(child);
      if (!value.getFileHandle) throw new Error("TypeMismatchError");
      return value;
    },
    async getFileHandle(fileName, options) {
      if (!tree.has(fileName)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        tree.set(fileName, { content: "" });
      }
      const value = tree.get(fileName);
      if (value.getDirectoryHandle)
        throw Object.assign(new Error("directory"), { name: "TypeMismatchError" });
      return {
        async getFile() {
          return {
            async text() {
              return value.content;
            },
          };
        },
        async createWritable() {
          let next = "";
          return {
            async write(content) {
              next = content;
            },
            async close() {
              value.content = next;
            },
          };
        },
      };
    },
    async removeEntry(entry) {
      tree.delete(entry);
    },
  };
}

test("only named source files are parsed for local writes", () => {
  const files = parseGeneratedWorkspaceFiles(
    'Review notes\n```tsx filepath=src/App.tsx\nexport default 1;\n```\n```json file=package.json\n{"name":"demo"}\n```',
  );
  assert.deepEqual(
    files.map(({ path }) => path),
    ["src/App.tsx", "package.json"],
  );
  assert.equal(files[0].content, "export default 1;\n");
});

test("unsafe paths and conflicting duplicate file outputs are rejected", () => {
  for (const path of [
    "../secret",
    "C:/secret",
    "/secret",
    ".git/config",
    "node_modules/a",
    ".env",
    "src/a?.ts",
  ]) {
    assert.throws(() => validateWorkspacePath(path));
  }
  assert.throws(
    () =>
      parseGeneratedWorkspaceFiles(
        "```ts filepath=src/a.ts\none\n```\n```ts filepath=src/a.ts\ntwo\n```",
      ),
    /conflicting contents/,
  );
});

test("file preview and application create files, update reviewed files, and read only bounded context", async () => {
  const sourceTree = new Map([
    ["src", mockDirectory("src", new Map([["App.tsx", { content: "old source\n" }]]))],
  ]);
  const root = mockDirectory("workspace", sourceTree);
  const output =
    '```tsx filepath=src/App.tsx\nnew source\n```\n```json filepath=package.json\n{"scripts":{}}\n```';
  const preview = await reviewGeneratedWorkspaceFiles(root, output);
  assert.equal(preview[0].previousContent, "old source\n");
  assert.equal(preview[1].previousContent, null);
  assert.equal(await applyReviewedWorkspaceFiles(root, preview), 2);
  assert.equal(
    await (
      await (await root.getDirectoryHandle("src")).getFileHandle("App.tsx")
    )
      .getFile()
      .then((file) => file.text()),
    "new source\n",
  );
  const context = await readRepositoryContext(root, ["src/App.tsx", "src/../.env"]);
  assert.match(context, /FILE src\/App\.tsx/);
  assert.doesNotMatch(context, /\.env/);
});

test("stale reviewed content is never silently overwritten", async () => {
  const folder = mockDirectory("workspace", new Map([["config.json", { content: "reviewed" }]]));
  const changes = await reviewGeneratedWorkspaceFiles(
    folder,
    "```json filepath=config.json\nnew\n```",
  );
  const file = await folder.getFileHandle("config.json");
  const writable = await file.createWritable();
  await writable.write("changed by user");
  await writable.close();
  await assert.rejects(applyReviewedWorkspaceFiles(folder, changes), /changed after review/);
  assert.equal(await file.getFile().then((item) => item.text()), "changed by user");
});
