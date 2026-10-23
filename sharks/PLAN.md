# Plan: ascii-sharks

## Goal

A visitor stocks an ASCII aquarium, drops food the fish swim toward, and saves a PNG, with the unlicensed ascii-sharks library pinned as a git dependency.

## MVP scope

In:

- One page on port 4480. Pick a shark kind, a size, a shark count, and a fish count. Switch among abyss, lagoon, dusk, and phosphor.
- Click the water to drop a pellet. Calm fish steer toward the nearest live pellet. A PNG button saves the frame the visitor sees, including the palette and the pellets.
- Tests for that steer and for the control parser.
- A README that says the library has no license and to ask the author before publishing.

Out:

- Copying library source into this repo, publishing the demo, and a GIF encoder.
- Choosing fish species. The package entry does not export them.
- `OceanEngine`. It cannot take a fish count, and a click splashes fish away.
- Accounts, saved tanks, and a mixed roster of different shark kinds.

## Tasks

1. Scaffold the Vite app so `pnpm install && pnpm run dev` serves an empty canvas on port 4480, with the git pin and the three-day release gate in place.
2. Land the settings parser, the food steer, the palette remap, and their tests.
3. Drive `World` and `AsciiRenderer` from one tank, bind the form, and show pellets.
4. Prove the controls, a food click, and the PNG in the browser.

## Stack

- pnpm 12.14.0, `packageManager`, and corepack. `minimumReleaseAge: 4320` in `pnpm-workspace.yaml`, the same gate as the other pnpm apps. The git dependency is not a registry release. Add an exclusion only if install rejects the pin, and record the error.
- `ascii-sharks` from GitHub at commit `c521e24a787e6d4cc460d4cf2b9815f25e4fe453`. The page uses `World` and `AsciiRenderer`, which that commit exports.
- Vite and TypeScript, pinned to the versions already used by colorfigures-lab (`vite` 8.3.4, `typescript` 6.0.3). Node's test runner. No UI framework. The aquarium is a canvas, and the controls are a form.

## Deferred

- A GIF. A correct encoder is a second exporter, and the PNG already matches the screen.
- A roster where each shark has its own kind.
- Publishing. That waits on a license from the author.
