import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("main does not import the library or the food module", () => {
  const mainPath = fileURLToPath(new URL("./main.ts", import.meta.url))
  const source = readFileSync(mainPath, "utf8")
  assert.equal(/(?:from\s+|import\s*\(\s*|import\s+)["']ascii-sharks["']/.test(source), false)
  assert.equal(/(?:from\s+|import\s*\(\s*|import\s+)["'](?:\.\/)?food\.ts["']/.test(source), false)
})
