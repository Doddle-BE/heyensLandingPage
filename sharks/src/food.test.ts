import assert from "node:assert/strict"
import test from "node:test"

import { dropPellet, pullFish, type Pellet, type Swimmer } from "./food.ts"

function calm(x: number, y: number, extra: Partial<Swimmer> = {}): Swimmer {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    alarm: 0,
    ...extra,
  }
}

test("a calm fish steers toward a pellet on its right", () => {
  const fish = calm(0, 0)
  pullFish([fish], [{ x: 100, y: 0, until: 100 }], 1, 0.5)
  assert.equal(fish.vx, 240 * 0.5)
  assert.equal(fish.vy, 0)
})

test("a fish on the far side of the tank still steers toward the pellet", () => {
  const fish = calm(0, 0)
  pullFish([fish], [{ x: 900, y: 0, until: 100 }], 1, 0.5)
  assert.equal(fish.vx, 240 * 0.5)
  assert.equal(fish.vy, 0)
})

test("a dead fish is not steered", () => {
  const fish = calm(0, 0, { alive: false })
  pullFish([fish], [{ x: 100, y: 0, until: 100 }], 1, 0.5)
  assert.equal(fish.vx, 0)
  assert.equal(fish.vy, 0)
})

test("fear at the cutoff holds, and just under it steers", () => {
  const frightened = calm(0, 0, { alarm: 0.45 })
  const calmEnough = calm(0, 0, { alarm: 0.44 })
  const pellet = [{ x: 100, y: 0, until: 100 }]
  pullFish([frightened], pellet, 1, 0.5)
  pullFish([calmEnough], pellet, 1, 0.5)
  assert.equal(frightened.vx, 0)
  assert.equal(calmEnough.vx, 240 * 0.5)
})

test("the nearer of two pellets wins, even when it sits to the left", () => {
  const fish = calm(0, 0)
  pullFish(
    [fish],
    [
      { x: -10, y: 0, until: 100 },
      { x: 200, y: 0, until: 100 },
    ],
    1,
    0.5,
  )
  assert.ok(fish.vx < 0)
})

test("an expired pellet does not steer and leaves the returned list", () => {
  const fish = calm(0, 0)
  const pellets = [{ x: 100, y: 0, until: 1 }]
  const kept = pullFish([fish], pellets, 1, 0.5)
  assert.equal(fish.vx, 0)
  assert.deepEqual(kept, [])
  assert.equal(pellets.length, 1)
})

test("dropPellet keeps two drops and forgets the oldest past the cap", () => {
  const first = dropPellet([], 1, 0, 0)
  const second = dropPellet(first, 2, 0, 0)
  assert.equal(second.length, 2)
  assert.equal(first.length, 1)
  const third = dropPellet(second, 3, 0, 0)
  const fourth = dropPellet(third, 4, 0, 0)
  assert.equal(fourth.length, 3)
  assert.deepEqual(
    fourth.map((pellet) => pellet.x),
    [2, 3, 4],
  )
})

test("repeated pulls carry a fish closer to the pellet", () => {
  const fish = calm(0, 0)
  let pellets: Pellet[] = [{ x: 120, y: 0, until: 100 }]
  const dt = 1 / 60
  const start = Math.abs(120 - fish.x)
  for (let step = 0; step < 45; step += 1) {
    pellets = pullFish([fish], pellets, 0, dt)
    fish.x += fish.vx * dt
  }
  assert.ok(Math.abs(120 - fish.x) < start)
})
