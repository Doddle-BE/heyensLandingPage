# Wasp flight & nest traffic — motion reference

Reference for the wasp scene's flight/choreography (ticket #4). **Primary-source revision.** Every quantitative biological claim below was verified this pass by reading the owning source directly (see the Verification log). Animation-design values (px/s mappings, tuning tables) are engineering choices, not findings, and are marked **[design]**.

Species matter and are not interchangeable: **_Vespa velutina_** (yellow-legged hornet) and **_Vespa crabro_** (European hornet) are large hornets; **_Vespula vulgaris_** (common wasp) is smaller; **_Cerceris_** is a solitary ground-nesting wasp. The scene is a stylized generic "wasp", so these are the nearest measured anchors, with the species named on each figure.

## 1. Motion texture

**Flight speed (measured, field).** Harmonic-radar tracking of _Vespa velutina_ workers in Italy gives mean ground speeds of **6.66 ± 2.31 m/s outbound (foraging, n=130)** and **4.06 ± 1.34 m/s returning (homing, n=186)**; the difference is significant (Wilcoxon, P<0.001) and is attributed to the **prey mass homing hornets carry**, not to nest-approach caution ([Lioy et al. 2021, *Scientific Reports*](https://www.nature.com/articles/s41598-021-91541-4)). The authors place these in context with honeybees 3.6–5.6 m/s, bumblebees 3.0–15.7 m/s, hornets ~5.9 m/s, and note lab flight-mill values are far lower (1.6 m/s) than free field flight. These are cross-country ground speeds over 96 m mean tracks — **not** near-nest maneuvering speed, which is much slower (see the orientation-flight turn data below).

**Turning (measured).** In departure orientation flights, _Cerceris_ wasps hold a **constant rate of turning between 100°/s and 200°/s**, independent of distance from the nest; ground velocity rises with distance, so the wasp circles the nest at roughly **constant angular velocity** ([Zeil 1993, *J Comp Physiol A* 172:189–205](https://link.springer.com/article/10.1007/BF00189396)). This is the strongest concrete anchor for near-nest motion: tight, continuously-turning arcs rather than straight lines.

**What reads as "wasp".** Combine (a) fast, fairly straight transits to/from the viewport edge, (b) slow, continuously-turning arc-work near the nest at constant angular velocity, and (c) brief hovers. The alternation of committed lines and abrupt arcs is the signature. Duty-cycle split (≈65% transit / 25% arc-hover / 10% dart) is **[design]** — no source apportions time this way.

## 2. Traffic at the nest

**Entrance rate (measured).** At a _Vespa crabro_ nest filmed over 10 days, an average of **15 hornets left or entered per 5-minute period during bright daytime hours** (≈3 crossings/min), rising somewhat in early evening ([Kelber et al. 2011, *PLOS ONE*](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0021892)). This is the daytime baseline — apt, since the art direction is a daylight scene. Scene target: **~3–9 crossings/min** with occasional 2–4-agent bursts **[design]**, tolerant of lulls.

**Departure vs approach structure (measured).** Departure "orientation flights" are highly structured: after lift-off the wasp flies in **ever-increasing arcs**, turning to keep the nest entrance in its lateral visual field (30–70° from the midline) and the nest ~45–60° below the horizon, distance and height growing through the flight ([Zeil 1993](https://link.springer.com/article/10.1007/BF00189396)). Return flights are not identical but share the arc-and-counter-turn geometry (Zeil 1993 Part II, [10.1007/BF00189397](https://link.springer.com/article/10.1007/BF00189397)). Transfer to the scene: outbound agents spiral out from the nest in widening arcs before committing to an exit; inbound agents arc in rather than arrowing straight to the hole.

**How many airborne.** A mature _Vespula vulgaris_ colony runs to thousands of individuals over a season (Archer's seasonal-development studies of _V. vulgaris_/_V. germanica_, [Archer 1972, *J Entomol Ser A*](https://resjournals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-3032.1972.tb00125.x)), so **8–40 agents airborne at once is a believable cropped sample**, not a full census **[design for the count; colony scale is the sourced part]**.

## 3. Algorithm survey (primary/originator sources)

- **Steering behaviors** — seek, flee, pursue, evade, **wander**, **arrival**, path following, flow-field following, plus flocking. Reynolds frames motion in three layers (action selection / steering / locomotion) and gives the vehicle model `steering = desired_velocity − current_velocity` ([Reynolds, "Steering Behaviors For Autonomous Characters", GDC 1999](https://www.red3d.com/cwr/steer/)). **Arrival** (decelerate into a target) and **wander** (smoothly-varying heading) map directly onto nest approach and idle drift. O(n) per frame — trivially cheap at 10–40 agents **[cost estimate: design]**.
- **Boids / flocking** — the originating model: **separation, alignment, cohesion** over local neighbors ([Reynolds, "Flocks, Herds, and Schools", SIGGRAPH '87, Computer Graphics 21(4):25–34](https://www.red3d.com/cwr/papers/1987/boids.html)). For wasps, use **separation only** (avoid overlap near the entrance); alignment+cohesion would make them school like fish — wrong. Naïve all-pairs is O(n²) (~1600 checks at 40 agents) — still fine here **[cost: design]**.
- **Gradient noise wander** — smoothly-varying pseudo-random fields for organic heading/position jitter, from the originator ([Perlin, "An Image Synthesizer", SIGGRAPH '85, Computer Graphics 19(3):287–296](https://dl.acm.org/doi/10.1145/325165.325247); cited from the bibliographic record, not re-read this pass). Perturb heading/speed; don't use as the primary planner.
- **Interpolating splines** — smooth authored approach/exit corridors through control points ([Catmull & Rom, "A class of local interpolating splines", 1974](https://doi.org/10.1016/B978-0-12-079050-0.50020-5); bibliographic record). Let steering/noise ride on the spine rather than hand-placing agents.

## 4. Recommended recipe

A **per-agent state machine driven by steering forces**, not raw boids:

- States: `outbound` (widening arcs from nest → exit at viewport edge), `inbound` (enter at edge → arc toward entrance → **arrive**), `local-orient` (constant-angular-velocity arcs near the entrance, à la Zeil), `hover-hold` (brief near-station), `offscreen-respawn`.
- Forces: **arrive** at the entrance, **wander** (gradient noise) for texture, **separation** near the entrance only. No global cohesion/alignment.
- Grounded anchors → design mapping: constant-angular-velocity arcs (Zeil 100–200°/s) drive `local-orient`; outbound-faster-than-inbound (Lioy) lets `outbound` cruise above `inbound`; entrance rate (Kelber ~3/min baseline) sets spawn cadence.

All table values are **[design]** starting points for a ~1600px-wide viewport, chosen so near-nest motion reads slow and arc-y while transits feel quick (viewport shows near-nest behavior, so speeds sit well below the field cross-country cruise):

| tunable | suggested start | range |
| --- | --- | --- |
| Transit (outbound) speed | 340 px/s | 240–520 |
| Transit (inbound) speed | 240 px/s | 160–360 |
| Local-orient angular velocity | 150°/s | 100–200 (Zeil-anchored) |
| Arrive radius at entrance | 42 px | 18–70 |
| Hover-hold duration | 0.55 s | 0.2–1.4 |
| Wander heading noise rate | 0.9 Hz | 0.4–1.8 |
| Wander heading amplitude | 14° | 6–28 |
| Dart probability / agent / s | 0.06 | 0.02–0.12 |
| Separation radius | 22 px | 12–34 |
| Entrance crossings / min | 6 | 3–9 (Kelber baseline ~3) |
| Airborne count | 18 | 8–40 |

## Verification log (source-by-source)

- **Lioy et al. 2021, *Sci Rep* 11:12143** — read full article; confirmed verbatim "foraging … 6.66 ± 2.31 m s−1 (n = 130) whereas homing … 4.06 ± 1.34 m s−1 (n = 186)", the P<0.001 difference, the prey-load explanation, and the context ranges. Open access. ✅
- **Zeil 1993, *J Comp Physiol A* 172:189–205** — read abstract; confirmed "ever increasing arcs", entrance at 30–70° retinal azimuth, 45–60° below horizon, "rate of turning … constant … between 100°/s and 200°/s", constant angular velocity. Species = _Cerceris_ (solitary); flagged in text. ✅ (Part II 172:207–222 corroborates return-flight similarity.)
- **Kelber et al. 2011, *PLOS ONE* 6(7):e21892** — read Results/Methods; confirmed verbatim "On average, 15 hornets left or entered the nest during a five minute period" and the 5-minute-slot counting method at a _Vespa crabro_ nest. Open access. ✅
- **Reynolds 1999 (GDC) & 1987 (SIGGRAPH), red3d.com** — read the author's own pages; confirmed the steering-behavior catalogue (incl. wander, arrival, path following) and boids' separation/alignment/cohesion. Author-hosted = primary. ✅
- **Perlin 1985; Catmull & Rom 1974** — cited from established bibliographic record (DOIs given); not re-opened this pass. Marked accordingly.

## References

- Lioy S. et al. (2021) *Tracking the invasive hornet Vespa velutina in complex environments by means of a harmonic radar.* Sci Rep 11:12143. https://www.nature.com/articles/s41598-021-91541-4
- Zeil J. (1993) *Orientation flights of solitary wasps (Cerceris; Sphecidae; Hymenoptera) I & II.* J Comp Physiol A 172:189–205, 207–222. https://link.springer.com/article/10.1007/BF00189396
- Kelber A. et al. (2011) *Hornets Can Fly at Night without Obvious Adaptations of Eyes and Ocelli.* PLOS ONE 6(7):e21892. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0021892
- Archer M.E. (1972) *The significance of worker size in the seasonal development of the wasps Vespula vulgaris and Vespula germanica.* J Entomol Ser A. https://resjournals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-3032.1972.tb00125.x
- Reynolds C.W. (1999) *Steering Behaviors For Autonomous Characters.* GDC. https://www.red3d.com/cwr/steer/
- Reynolds C.W. (1987) *Flocks, Herds, and Schools: A Distributed Behavioral Model.* SIGGRAPH '87, Computer Graphics 21(4):25–34. https://www.red3d.com/cwr/papers/1987/boids.html
- Perlin K. (1985) *An Image Synthesizer.* SIGGRAPH '85, Computer Graphics 19(3):287–296. https://dl.acm.org/doi/10.1145/325165.325247
- Catmull E. & Rom R. (1974) *A class of local interpolating splines.* https://doi.org/10.1016/B978-0-12-079050-0.50020-5
