import type { SharkKind, SharkSpec } from "ascii-sharks"

import { paletteIds } from "./palette.ts"
import type { PaletteId } from "./palette.ts"

export const SHARK_KINDS = [
  "classic",
  "hammerhead",
  "zebra",
  "tiger",
  "greathammer",
  "mako",
  "thresher",
  "nurse",
] as const satisfies readonly SharkKind[]

type SharkKindsComplete = Exclude<SharkKind, (typeof SHARK_KINDS)[number]> extends never ? true : never
const sharkKindsComplete: SharkKindsComplete = true
void sharkKindsComplete

export const SHARK_LABELS: Record<SharkKind, string> = {
  classic: "Classic",
  hammerhead: "Hammerhead",
  zebra: "Zebra",
  tiger: "Tiger",
  greathammer: "Great hammerhead",
  mako: "Mako",
  thresher: "Thresher",
  nurse: "Nurse",
}

export const SHARK_CHOICES = SHARK_KINDS.map((id) => ({
  id,
  label: SHARK_LABELS[id],
}))

export const SHARK_SIZE = { min: 0.5, max: 1, step: 0.05 } as const
export const SHARK_COUNT = { min: 1, max: 6, step: 1 } as const
export const FISH_COUNT = { min: 12, max: 280, step: 4 } as const

declare const sharkSizeBrand: unique symbol
declare const sharkCountBrand: unique symbol
declare const fishCountBrand: unique symbol

export type SharkSize = number & { readonly [sharkSizeBrand]: "SharkSize" }
export type SharkCount = number & { readonly [sharkCountBrand]: "SharkCount" }
export type FishCount = number & { readonly [fishCountBrand]: "FishCount" }

export interface Settings {
  kind: SharkKind
  size: SharkSize
  sharkCount: SharkCount
  fishCount: FishCount
  palette: PaletteId
}

export interface RawSettings {
  kind: string
  size: string
  sharkCount: string
  fishCount: string
  palette: string
}

export type ParseResult = { ok: true; settings: Settings } | { ok: false; message: string }

export const DEFAULT_RAW: RawSettings = {
  kind: "hammerhead",
  size: "1",
  sharkCount: "2",
  fishCount: "80",
  palette: "abyss",
}

function isSharkKind(value: string): value is SharkKind {
  for (const kind of SHARK_KINDS) {
    if (kind === value) {
      return true
    }
  }
  return false
}

function isPaletteId(value: string): value is PaletteId {
  return paletteIds().some((id) => id === value)
}

function onStep(value: number, step: number): boolean {
  const ticks = value / step
  return Math.abs(ticks - Math.round(ticks)) < 1e-6
}

function isSharkSize(value: number): value is SharkSize {
  return Number.isFinite(value) && value >= SHARK_SIZE.min && value <= SHARK_SIZE.max && onStep(value, SHARK_SIZE.step)
}

function isSharkCount(value: number): value is SharkCount {
  return Number.isInteger(value) && value >= SHARK_COUNT.min && value <= SHARK_COUNT.max
}

function isFishCount(value: number): value is FishCount {
  return Number.isInteger(value) && value >= FISH_COUNT.min && value <= FISH_COUNT.max
}

export function readSettings(raw: RawSettings): ParseResult {
  if (!isSharkKind(raw.kind)) {
    return { ok: false, message: "Unknown kind." }
  }
  if (!isPaletteId(raw.palette)) {
    return { ok: false, message: "Unknown palette." }
  }
  const size = Number(raw.size)
  const sharkCount = Number(raw.sharkCount)
  const fishCount = Number(raw.fishCount)
  if (!Number.isFinite(size)) {
    return { ok: false, message: "Size is not a number." }
  }
  if (!isSharkSize(size)) {
    return { ok: false, message: "Size is out of range." }
  }
  if (!Number.isFinite(sharkCount)) {
    return { ok: false, message: "Shark count is not a number." }
  }
  if (!isSharkCount(sharkCount)) {
    return { ok: false, message: "Shark count is out of range." }
  }
  if (!Number.isFinite(fishCount)) {
    return { ok: false, message: "Fish count is not a number." }
  }
  if (!isFishCount(fishCount)) {
    return { ok: false, message: "Fish count is out of range." }
  }
  return {
    ok: true,
    settings: {
      kind: raw.kind,
      size,
      sharkCount,
      fishCount,
      palette: raw.palette,
    },
  }
}

export function sharkRoster(settings: Settings): SharkSpec[] {
  const specs: SharkSpec[] = []
  for (let index = 0; index < settings.sharkCount; index += 1) {
    specs.push({ kind: settings.kind, size: settings.size })
  }
  return specs
}
