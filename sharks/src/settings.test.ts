import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_RAW, readSettings, SHARK_CHOICES, sharkRoster, type RawSettings } from "./settings.ts"

function raw(overrides: Partial<RawSettings>): RawSettings {
  return { ...DEFAULT_RAW, ...overrides }
}

test("a thresher roster of three at 0.8 in lagoon parses", () => {
  const result = readSettings({
    kind: "thresher",
    size: "0.8",
    sharkCount: "3",
    fishCount: "40",
    palette: "lagoon",
  })
  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }
  const roster = sharkRoster(result.settings)
  assert.equal(roster.length, 3)
  for (const spec of roster) {
    assert.equal(spec.kind, "thresher")
    assert.equal(spec.size, 0.8)
  }
})

test("an unknown kind fails and carries no settings", () => {
  const result = readSettings(raw({ kind: "whale" }))
  assert.equal(result.ok, false)
  assert.equal("settings" in result, false)
})

test("counts and size outside the ranges fail", () => {
  assert.equal(readSettings(raw({ sharkCount: "0" })).ok, false)
  assert.equal(readSettings(raw({ sharkCount: "99" })).ok, false)
  assert.equal(readSettings(raw({ fishCount: "10" })).ok, false)
  assert.equal(readSettings(raw({ size: "0.33" })).ok, false)
  assert.equal(readSettings(raw({ size: "nope" })).ok, false)
  assert.equal(readSettings(raw({ palette: "neon" })).ok, false)
})

test("the default form values parse", () => {
  const result = readSettings(DEFAULT_RAW)
  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }
  assert.equal(result.settings.kind, "hammerhead")
  assert.equal(result.settings.palette, "abyss")
})

test("shark choices list the eight kinds", () => {
  assert.deepEqual(
    SHARK_CHOICES.map((choice) => choice.id),
    ["classic", "hammerhead", "zebra", "tiger", "greathammer", "mako", "thresher", "nurse"],
  )
})
