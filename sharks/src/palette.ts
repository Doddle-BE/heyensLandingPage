export const PALETTES = {
  abyss: {
    id: "abyss",
    label: "Abyss",
    identity: true,
    water: [0, 0, 0],
    multiply: [255, 255, 255],
  },
  lagoon: {
    id: "lagoon",
    label: "Lagoon",
    identity: false,
    water: [4, 28, 42],
    multiply: [150, 230, 255],
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    identity: false,
    water: [28, 8, 24],
    multiply: [255, 170, 140],
  },
  phosphor: {
    id: "phosphor",
    label: "Phosphor",
    identity: false,
    water: [6, 18, 10],
    multiply: [160, 255, 170],
  },
} as const

export type PaletteId = keyof typeof PALETTES

export interface Palette {
  id: PaletteId
  label: string
  identity: boolean
  water: readonly [number, number, number]
  multiply: readonly [number, number, number]
}

const WATER_CUTOFF = 8

export function paletteIds(): readonly PaletteId[] {
  return Object.keys(PALETTES).filter((key): key is PaletteId =>
    Object.prototype.hasOwnProperty.call(PALETTES, key),
  )
}

export function paletteChoices(): readonly { id: PaletteId; label: string }[] {
  return Object.values(PALETTES).map((palette) => ({
    id: palette.id,
    label: palette.label,
  }))
}

export function recolor(pixels: Uint8ClampedArray, palette: Palette): void {
  if (palette.identity) {
    return
  }
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    const alpha = pixels[index + 3] ?? 0
    if (Math.max(red, green, blue) < WATER_CUTOFF) {
      pixels[index] = palette.water[0]
      pixels[index + 1] = palette.water[1]
      pixels[index + 2] = palette.water[2]
      pixels[index + 3] = alpha
      continue
    }
    pixels[index] = Math.round((red * palette.multiply[0]) / 255)
    pixels[index + 1] = Math.round((green * palette.multiply[1]) / 255)
    pixels[index + 2] = Math.round((blue * palette.multiply[2]) / 255)
    pixels[index + 3] = alpha
  }
}
