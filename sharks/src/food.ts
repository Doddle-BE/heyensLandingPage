export interface Swimmer {
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
  alarm: number
}

export interface Pellet {
  x: number
  y: number
  until: number
}

export const PELLET_LIFE = 8
export const FOOD_CAP = 3
export const FEAR = 0.45
export const ATTRACT_ACCEL = 240

export function dropPellet(pellets: readonly Pellet[], x: number, y: number, now: number): Pellet[] {
  const next = [...pellets, { x, y, until: now + PELLET_LIFE }]
  while (next.length > FOOD_CAP) {
    next.shift()
  }
  return next
}

export function pullFish(
  fish: readonly Swimmer[],
  pellets: readonly Pellet[],
  now: number,
  dt: number,
): Pellet[] {
  const kept = pellets.filter((pellet) => pellet.until > now)
  for (const swimmer of fish) {
    if (!swimmer.alive || swimmer.alarm >= FEAR) {
      continue
    }
    let nearestDx = 0
    let nearestDy = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const pellet of kept) {
      const dx = pellet.x - swimmer.x
      const dy = pellet.y - swimmer.y
      const distance = Math.hypot(dx, dy)
      if (distance === 0 || distance >= nearestDistance) {
        continue
      }
      nearestDx = dx
      nearestDy = dy
      nearestDistance = distance
    }
    if (!Number.isFinite(nearestDistance)) {
      continue
    }
    swimmer.vx += (nearestDx / nearestDistance) * ATTRACT_ACCEL * dt
    swimmer.vy += (nearestDy / nearestDistance) * ATTRACT_ACCEL * dt
  }
  return kept
}
