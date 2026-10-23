import { AsciiRenderer, World } from "ascii-sharks"

import { dropPellet, pullFish } from "./food.ts"
import type { Pellet } from "./food.ts"
import { PALETTES, recolor } from "./palette.ts"
import { sharkRoster } from "./settings.ts"
import type { Settings } from "./settings.ts"

export interface Tank {
  apply(settings: Settings): void
  dropFood(x: number, y: number): void
  png(): Promise<Blob>
  destroy(): void
}

// ascii-sharks does not export the fixed step, so the clock stays in this file.
const STEP = 1 / 60
const MAX_STEPS = 4
const STILL_STEPS = 240
const FOOD_STEPS = 30

interface View {
  width: number
  height: number
  ratio: number
}

export function createTank(canvas: HTMLCanvasElement, settings: Settings): Tank {
  const renderer = new AsciiRenderer(canvas)
  renderer.setFontFamily(getComputedStyle(canvas).fontFamily)

  let world = new World(sharkRoster(settings), settings.fishCount)
  let pellets: Pellet[] = []
  let committed = settings
  let disposed = false
  let acc = 0
  let last = 0
  let frame = 0
  let onScreen = true
  let seenWidth = 0
  let seenHeight = 0
  let seenRatio = 0

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)")

  function viewOf(): View | undefined {
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) {
      return undefined
    }
    return {
      width: rect.width,
      height: rect.height,
      ratio: Math.min(window.devicePixelRatio || 1, 2),
    }
  }

  function fitRenderer(view: View): void {
    if (view.width === seenWidth && view.height === seenHeight && view.ratio === seenRatio) {
      return
    }
    seenWidth = view.width
    seenHeight = view.height
    seenRatio = view.ratio
    renderer.resize(view.width, view.height, view.ratio)
  }

  function fit(target: World): void {
    const view = viewOf()
    if (view === undefined) {
      return
    }
    fitRenderer(view)
    target.resize(view.width, view.height, renderer.cellWidth, renderer.cellHeight)
  }

  function advance(count: number): void {
    for (let step = 0; step < count; step += 1) {
      world.step(STEP)
      pellets = pullFish(world.fish, pellets, world.time, STEP)
    }
  }

  function present(dt: number): void {
    renderer.render(world, dt)
    const context = canvas.getContext("2d")
    if (context === null) {
      return
    }
    context.fillStyle = "#f4e2a4"
    context.textAlign = "center"
    context.textBaseline = "middle"
    for (const pellet of pellets) {
      context.fillText("+", pellet.x, pellet.y)
    }
    const palette = PALETTES[committed.palette]
    if (palette.identity) {
      return
    }
    // getImageData is in device pixels because the renderer already sized the buffer by dpr, and a CSS-pixel blit would scale the frame twice.
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    recolor(image.data, palette)
    context.putImageData(image, 0, 0)
  }

  function holdStill(): void {
    if (world.width === 0) {
      return
    }
    // 240 steps of 1/60 land just under 4, so a second resize must not fast-forward again.
    if (world.time < 4 - 1e-4) {
      advance(STILL_STEPS)
    }
    present(STEP)
  }

  function stop(): void {
    cancelAnimationFrame(frame)
    frame = 0
  }

  function tick(now: number): void {
    if (disposed || motion.matches || !onScreen) {
      frame = 0
      return
    }
    const dt = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000)
    last = now
    acc += dt
    let steps = 0
    while (acc >= STEP && steps < MAX_STEPS) {
      world.step(STEP)
      pellets = pullFish(world.fish, pellets, world.time, STEP)
      acc -= STEP
      steps += 1
    }
    if (steps === MAX_STEPS) {
      acc = 0
    }
    present(dt)
    frame = requestAnimationFrame(tick)
  }

  function start(): void {
    if (disposed || motion.matches || !onScreen || frame !== 0) {
      return
    }
    frame = requestAnimationFrame(tick)
  }

  function onResize(): void {
    fit(world)
    if (motion.matches) {
      holdStill()
    }
  }

  function onMotionChange(): void {
    if (motion.matches) {
      stop()
      holdStill()
      return
    }
    start()
  }

  const resizeObserver = new ResizeObserver(() => {
    onResize()
  })
  resizeObserver.observe(canvas)

  const intersectionObserver = new IntersectionObserver((entries) => {
    const latest = entries[entries.length - 1]
    onScreen = latest?.isIntersecting ?? false
    if (!onScreen) {
      stop()
      return
    }
    start()
  })
  intersectionObserver.observe(canvas)

  motion.addEventListener("change", onMotionChange)
  fit(world)
  if (motion.matches) {
    holdStill()
  } else {
    start()
  }

  function sameSettings(next: Settings): boolean {
    return (
      next.kind === committed.kind &&
      next.size === committed.size &&
      next.sharkCount === committed.sharkCount &&
      next.fishCount === committed.fishCount &&
      next.palette === committed.palette
    )
  }

  function sameStock(next: Settings): boolean {
    return (
      next.kind === committed.kind &&
      next.size === committed.size &&
      next.sharkCount === committed.sharkCount &&
      next.fishCount === committed.fishCount
    )
  }

  function apply(next: Settings): void {
    if (disposed || sameSettings(next)) {
      return
    }
    if (sameStock(next)) {
      committed = next
      present(STEP)
      return
    }
    const nextWorld = new World(sharkRoster(next), next.fishCount)
    const view = viewOf()
    if (view !== undefined) {
      fitRenderer(view)
      nextWorld.resize(view.width, view.height, renderer.cellWidth, renderer.cellHeight)
    }
    world = nextWorld
    pellets = []
    committed = next
    acc = 0
    if (motion.matches) {
      holdStill()
    }
  }

  function dropFood(x: number, y: number): void {
    if (disposed || world.width === 0) {
      return
    }
    const clampedX = Math.min(world.width, Math.max(0, x))
    const clampedY = Math.min(world.height, Math.max(0, y))
    pellets = dropPellet(pellets, clampedX, clampedY, world.time)
    if (motion.matches) {
      advance(FOOD_STEPS)
      present(STEP)
    }
  }

  function png(): Promise<Blob> {
    present(STEP)
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob === null) {
          reject(new Error("PNG export failed."))
          return
        }
        resolve(blob)
      }, "image/png")
    })
  }

  function destroy(): void {
    if (disposed) {
      return
    }
    disposed = true
    stop()
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    motion.removeEventListener("change", onMotionChange)
  }

  return { apply, dropFood, png, destroy }
}
