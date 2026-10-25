import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeRelative, resolveInsideRoot } from "../../src/filesystem/paths.js";
import { protectedReason } from "../../src/filesystem/protected.js";
import { atomicWrite } from "../../src/filesystem/safe-write.js";
import { walkFiles } from "../../src/filesystem/walk.js";
import { makeProject } from "../helpers.js";

const protection = { generatedDirectories: ["designrail/reports", "designrail/tasks"] };

describe("path safety", () => {
  it("rejects directory traversal and absolute paths outside the root", () => {
    const root = makeProject({ "src/a.tsx": "" });
    expect(() => resolveInsideRoot(root, "../outside.tsx")).toThrow(/outside the project root/);
    expect(() => resolveInsideRoot(root, "src/../../x")).toThrow(/outside the project root/);
    expect(() => resolveInsideRoot(root, "/etc/passwd")).toThrow(/outside the project root/);
    expect(() => resolveInsideRoot(root, "a\0b")).toThrow(/NUL/);
    expect(resolveInsideRoot(root, "./src//a.tsx").relative).toBe("src/a.tsx");
  });

  it("rejects paths that resolve through symlinks outside the root", () => {
    const outside = makeProject({ "secret.tsx": "x" });
    const root = makeProject({});
    symlinkSync(outside, join(root, "linked"));
    expect(() => resolveInsideRoot(root, "linked/secret.tsx")).toThrow(/symlink outside/);
  });

  it("normalizes configured relative paths", () => {
    expect(normalizeRelative("./designrail//reports/")).toBe("designrail/reports");
    expect(normalizeRelative(".")).toBe("");
  });
});

describe("atomic writes", () => {
  it("writes inside the root and refuses existing files when asked", () => {
    const root = makeProject({ "keep.md": "mine" });
    atomicWrite(root, "out/new.md", "hello");
    expect(readFileSync(join(root, "out/new.md"), "utf8")).toBe("hello");
    expect(() => atomicWrite(root, "keep.md", "theirs", { mustNotExist: true })).toThrow(
      /will not be overwritten/,
    );
    expect(readFileSync(join(root, "keep.md"), "utf8")).toBe("mine");
  });

  it("refuses to write through a symlink, even one inside the root", () => {
    const root = makeProject({ "real.md": "original" });
    symlinkSync(join(root, "real.md"), join(root, "AGENTS.md"));
    expect(() => atomicWrite(root, "AGENTS.md", "x")).toThrow(/symbolic link/);
    expect(readFileSync(join(root, "real.md"), "utf8")).toBe("original");
  });

  it("refuses output paths outside the root", () => {
    const root = makeProject({});
    expect(() => atomicWrite(root, "../escape.md", "x")).toThrow(/outside the project root/);
  });
});

describe("protected paths", () => {
  it.each([
    [".env", true],
    [".env.local", true],
    ["config/server.pem", true],
    ["keys/id_rsa", true],
    ["node_modules/react/index.js", true],
    ["packages/web/dist/app.js", true],
    [".next/server/page.js", true],
    ["coverage/lcov.js", true],
    ["pnpm-lock.yaml", true],
    ["designrail/reports/latest.json", true],
    ["designrail/tasks/2026-01-01-x.md", true],
    ["src/environment.tsx", false],
    ["src/components/build-info.tsx", false],
  ])("%s protected=%s", (path, expected) => {
    expect(protectedReason(path, protection) !== null).toBe(expected);
  });
});

describe("file walking", () => {
  it("skips protected paths and never follows symlinked directories or outside files", () => {
    const outside = makeProject({ "leak.tsx": "export const x = 1;" });
    const root = makeProject({
      "src/a.tsx": "",
      "src/.env": "SECRET=1",
      "node_modules/pkg/index.js": "",
      "dist/out.js": "",
      "designrail/reports/latest.json": "{}",
    });
    mkdirSync(join(root, "src/nested"));
    writeFileSync(join(root, "src/nested/b.css"), "");
    symlinkSync(join(outside, "leak.tsx"), join(root, "src/leak.tsx"));
    symlinkSync(join(root, "src/nested"), join(root, "src/loop"));
    symlinkSync(join(root, "src/a.tsx"), join(root, "src/alias.tsx"));
    const result = walkFiles(root, ["."], protection);
    expect(result.files).toEqual(["src/a.tsx", "src/alias.tsx", "src/nested/b.css"]);
    expect(result.skipped.map((s) => s.path).sort()).toEqual(["src/leak.tsx", "src/loop"]);
  });

  it("reports explicitly requested protected paths", () => {
    const root = makeProject({ ".env": "X=1" });
    const result = walkFiles(root, [".env"], protection);
    expect(result.files).toEqual([]);
    expect(result.skipped[0]!.reason).toMatch(/secret/);
  });
});
