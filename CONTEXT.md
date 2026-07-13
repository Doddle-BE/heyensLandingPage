# Context

Glossary for the heyens landing page. Pure vocabulary — implementation detail lives in code and ADRs, never here.

- **Scene** — a full-screen animated backdrop the site shows. Exactly one scene plays at a time.
- **Starfield scene** — the original scene: photoreal WebGL night sky with a 2D-canvas fallback. Preserved as-is.
- **Wasp scene** — the new scene: wasps flying in and out of their nest. The default scene once shipped.
- **Option model** — the mechanism by which a visitor (or the owner) picks which scene plays: what the default is, how the choice is expressed, whether it persists.
- **Nest** — the wasps' home on screen; the anchor of the wasp scene's choreography (wasps enter and exit through it).
