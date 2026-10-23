const DISMISSED_KEY = "aquarium.motionNotice.dismissed"

export function watchReducedMotion(dialog: HTMLDialogElement): void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)")

  function show(): void {
    if (motion.matches && !dismissed() && !dialog.open) {
      dialog.showModal()
    }
  }

  dialog.addEventListener("close", () => {
    if (!motion.matches) {
      return
    }
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // storage blocked; notice simply reappears next visit
    }
  })

  motion.addEventListener("change", () => {
    if (!motion.matches && dialog.open) {
      dialog.close()
      return
    }
    show()
  })

  show()
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}
