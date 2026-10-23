import assert from "node:assert/strict"
import test from "node:test"

import { PALETTES, paletteChoices, paletteIds, recolor } from "./palette.ts"

test("abyss leaves a lit pixel unchanged", () => {
  const pixels = new Uint8ClampedArray([10, 20, 30, 255])
  recolor(pixels, PALETTES.abyss)
  assert.deepEqual([...pixels], [10, 20, 30, 255])
})

test("lagoon paints black water", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255])
  recolor(pixels, PALETTES.lagoon)
  assert.deepEqual([...pixels], [4, 28, 42, 255])
})

test("lagoon multiplies a lit pixel and keeps alpha", () => {
  const pixels = new Uint8ClampedArray([200, 200, 200, 255])
  recolor(pixels, PALETTES.lagoon)
  assert.deepEqual(
    [...pixels],
    [Math.round((200 * 150) / 255), Math.round((200 * 230) / 255), Math.round((200 * 255) / 255), 255],
  )
})

test("palette choices follow palette ids", () => {
  const ids = paletteIds()
  assert.deepEqual(
    paletteChoices().map((choice) => choice.id),
    [...ids],
  )
  assert.equal(ids.length, 4)
  assert.equal(ids[0], "abyss")
})
