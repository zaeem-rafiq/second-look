import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The product never says "safe". This scans every user-facing source file for
// the word inside string literals or JSX text (identifiers like isSafe are not user-facing).
const ROOTS = ["src", "convex", "lib"];
const SKIP = new Set(["_generated", "node_modules"]);
const EXT = new Set([".ts", ".tsx", ".html", ".md"]);

function walk(dir: string, out: string[]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([...EXT].some((e) => p.endsWith(e)) && !p.endsWith(".test.ts")) out.push(p);
  }
}

describe("no user-facing 'safe'", () => {
  it("never appears in a string literal or JSX text", () => {
    const files: string[] = [];
    for (const r of ROOTS) walk(join(process.cwd(), r), files);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const strings = src.match(/(["'`])(?:\\.|(?!\1)[^\\])*\1|>[^<{]*</g) ?? [];
      for (const s of strings) {
        if (/\bsafe(ly|r|st)?\b/i.test(s) && !/\bunsafe\b/i.test(s)) offenders.push(`${f}: ${s.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
