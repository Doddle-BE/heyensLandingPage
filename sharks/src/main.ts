import { paletteChoices } from "./palette.ts"
import {
  DEFAULT_RAW,
  FISH_COUNT,
  readSettings,
  SHARK_CHOICES,
  SHARK_COUNT,
  SHARK_SIZE,
} from "./settings.ts"
import type { RawSettings } from "./settings.ts"
import { createTank } from "./tank.ts"

const canvas = document.querySelector("#ocean")
const form = document.querySelector("#controls")
const status = document.querySelector("#status")
const save = document.querySelector("#save")

if (
  !(canvas instanceof HTMLCanvasElement) ||
  !(form instanceof HTMLFormElement) ||
  !(status instanceof HTMLElement) ||
  !(save instanceof HTMLButtonElement)
) {
  throw new Error("Aquarium markup is missing a control.")
}

const kind = form.elements.namedItem("kind")
const size = form.elements.namedItem("size")
const sharkCount = form.elements.namedItem("sharkCount")
const fishCount = form.elements.namedItem("fishCount")
const palette = form.elements.namedItem("palette")

if (
  !(kind instanceof HTMLSelectElement) ||
  !(size instanceof HTMLInputElement) ||
  !(sharkCount instanceof HTMLInputElement) ||
  !(fishCount instanceof HTMLInputElement) ||
  !(palette instanceof HTMLSelectElement)
) {
  throw new Error("Aquarium markup is missing a field.")
}

fillSelect(kind, SHARK_CHOICES)
fillSelect(palette, paletteChoices())
configureRange(size, SHARK_SIZE, DEFAULT_RAW.size)
configureRange(sharkCount, SHARK_COUNT, DEFAULT_RAW.sharkCount)
configureRange(fishCount, FISH_COUNT, DEFAULT_RAW.fishCount)
kind.value = DEFAULT_RAW.kind
palette.value = DEFAULT_RAW.palette
syncOutputs(form)

const parsed = readSettings(DEFAULT_RAW)
if (!parsed.ok) {
  throw new Error(parsed.message)
}

const tank = createTank(canvas, parsed.settings)

form.addEventListener("input", () => {
  syncOutputs(form)
})

form.addEventListener("change", () => {
  syncOutputs(form)
  const result = readSettings(rawFrom(form))
  if (!result.ok) {
    status.textContent = result.message
    return
  }
  status.textContent = ""
  tank.apply(result.settings)
})

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return
  }
  const rect = canvas.getBoundingClientRect()
  tank.dropFood(event.clientX - rect.left, event.clientY - rect.top)
})

save.addEventListener("click", () => {
  void tank.png().then(
    (blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "aquarium.png"
      link.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    },
    (error: unknown) => {
      status.textContent = error instanceof Error ? error.message : "PNG export failed."
    },
  )
})

window.addEventListener("pagehide", () => {
  tank.destroy()
})

function fillSelect(select: HTMLSelectElement, choices: readonly { id: string; label: string }[]): void {
  select.replaceChildren()
  for (const choice of choices) {
    const option = document.createElement("option")
    option.value = choice.id
    option.textContent = choice.label
    select.append(option)
  }
}

function configureRange(
  input: HTMLInputElement,
  bounds: { readonly min: number; readonly max: number; readonly step: number },
  value: string,
): void {
  input.min = String(bounds.min)
  input.max = String(bounds.max)
  input.step = String(bounds.step)
  input.value = value
}

function syncOutputs(target: HTMLFormElement): void {
  for (const name of ["size", "sharkCount", "fishCount"]) {
    const output = target.querySelector(`output[data-for="${name}"]`)
    const input = target.elements.namedItem(name)
    if (output instanceof HTMLOutputElement && input instanceof HTMLInputElement) {
      output.value = input.value
    }
  }
}

function rawFrom(target: HTMLFormElement): RawSettings {
  const data = new FormData(target)
  return {
    kind: stringField(data, "kind"),
    size: stringField(data, "size"),
    sharkCount: stringField(data, "sharkCount"),
    fishCount: stringField(data, "fishCount"),
    palette: stringField(data, "palette"),
  }
}

function stringField(data: FormData, name: string): string {
  const value = data.get(name)
  return typeof value === "string" ? value : ""
}
