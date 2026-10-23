# Run the ASCII aquarium

ascii-sharks has no license and is not on npm. This demo depends on commit c521e24a787e6d4cc460d4cf2b9815f25e4fe453 as a private git dependency. Ask the author for a license before publishing.

## Start the demo

From `apps/ascii-sharks`, run these commands.

1. `corepack enable`
2. `corepack prepare pnpm@12.14.0 --activate`
3. `pnpm install`
4. `pnpm run dev`

Open the page on port 4480.

Run `pnpm test` to check the food steer, the settings parser, and the palette remap.

The page constructs `World` with a fish count and draws with `AsciiRenderer`. `OceanEngine` cannot take a fish count, and its click splashes the fish away.

The git dependency did not need a minimumReleaseAge exclusion.
