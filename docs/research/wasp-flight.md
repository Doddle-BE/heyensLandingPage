# Social-wasp flight and nest-entrance traffic for animation

## Scope and evidence rules

This note answers issue #4 for animation design. It separates three groups that are often blurred together:

- **hornets** (*Vespa*), especially *Vespa crabro* and *V. velutina*;
- **yellowjackets/common wasps** (*Vespula*), especially *V. vulgaris*, *V. germanica*, and *V. arenaria*;
- **paper wasps** (*Polistes* and other Polistinae).

A result for one group is not treated as a measurement of another. Likewise, feeder flights, tethered flight-mill trials, solitary-wasp nest flights, and routine traffic at a social-wasp nest are different contexts. Each transfer between contexts is called out.

Labels used below:

- **Observed** — reported by the cited primary study.
- **Derived** — arithmetic or an animation inference shown explicitly from observed values.
- **Design** — a tunable recommendation, not a biological measurement.
- **Gap** — the requested datum was not supported by a suitable primary source found for this note.

## Bottom line

A convincing scene should not be a permanently coherent flock. The strongest social-wasp evidence instead supports:

1. mostly directed individual transits;
2. brief, context-dependent side-to-side inspection before landing;
3. occasional expanding, goal-centred learning arcs on departure, not loops on every departure;
4. a traffic rate that changes with daylight and weather rather than synchronized “bursting” caused by neighbours;
5. very few agents simultaneously occupying a tight entrance crop at measured baseline traffic.

The implementation consequence is a **traffic scheduler plus per-agent state machine**, with Reynolds-style seek/arrival/path-following and low-amplitude wander. Use separation locally to prevent visual overlap. Do not add global cohesion/alignment unless the art direction intentionally depicts an alarm or aggregation rather than routine nest traffic.

## What is actually measured

### Speed and flight context

| taxon and context | measurement | what it can support | limitation |
| --- | --- | --- | --- |
| *Vespula vulgaris*, free flight between flowers 10 cm apart | Golding et al. filmed 21 flights by 13 wasps at 0.04 s per frame. Their Fig. 3 places the mean at approximately **0.16 m/s**. Speed excluded intervals below **0.05 m/s**, the study's operational definition of hovering ([Methods, Fig. 3](https://doi.org/10.1242/jeb.01932)). | A defensible slow, close-range inspection/feeding-flight anchor. | It is a 10 cm outdoor flower array, not cruise between nest and forage and not a nest approach. The approximate 0.16 m/s value is read from the plotted mean, not a number printed in the text. |
| *Vespa velutina*, harmonic-radar-tracked field transits between nests and apiaries | Outbound “foraging” ground speed was **6.66 ± 2.31 m/s** (`n = 130`); homing ground speed was **4.06 ± 1.34 m/s** (`n = 186`, Wilcoxon `P < 0.001`) ([Lioy et al. 2021, Results “Vespa velutina flying speed,” Fig. 5](https://doi.org/10.1038/s41598-021-91541-4)). | A free-field, long-range hornet-transit anchor and a measured directional asymmetry. | Tagged autumn workers were followed over tracks averaging 96 ± 62 m; these are ground speeds, not airspeeds or final nest-approach speeds. The authors say the slower homing group probably reflects carried prey mass or predation energy cost. It is a hornet, not *Vespula* or *Polistes*. |
| *Vespa velutina nigrithorax*, tethered workers on a 318.3 mm-radius computerized flight mill | Mean flight-phase speed was **1.56 ± 0.29 m/s**, range **0.90–2.10 m/s**, using each worker's first five tests ([Sauvard et al. 2018, Results “Daily flight capacity,” Fig. 4](https://doi.org/10.1371/journal.pone.0198597)). | A hornet-scale sustained-flight bracket, useful only as a separate regime from close inspection. | The authors explicitly say flight mills do not capture natural dynamics and can over- or underestimate performance; the apparatus removes normal stimuli and body-weight support while adding mill resistance ([Introduction and “Flight mill design”](https://doi.org/10.1371/journal.pone.0198597)). It is a hornet, not *Vespula* or *Polistes*. |
| *Polistes* paper wasps | **Gap:** no comparable primary measurement of unrestrained routine nest-approach speed was verified here. | None. Keep paper-wasp speed independently tunable. | Do not apply the *Vespula* flower speed or either *Vespa* field/laboratory speed as a measured *Polistes* value. |

The old 5.7 m/s “hornet” value remains removed: its route through an encyclopedia/table did not lead to a defensible original measurement for this scene. A nearby order of magnitude is now supported separately by Lioy et al.'s measured *V. velutina* field tracks, with their own taxon, direction, season, ground-speed, and tracking-context caveats.

**Derived physical-to-screen mapping.** If the art later establishes a scale of `S` pixels per metre, the measured contexts map to approximately `0.16 × S` px/s for close *V. vulgaris* flower inspection; `1.56 × S` px/s for tethered *V. velutina* flight; and `6.66 × S` outbound or `4.06 × S` homing px/s for tracked *V. velutina* field transit. Without `S`, any px/s figure is necessarily a **design value**, not a converted biological speed.

### Hovering, zigzags, turns, and orientation flights

#### Yellowjackets/common wasps (*Vespula*)

- **Observed — near-landing texture, not nest landing.** In Golding et al.'s flower-array experiment, only **1 of 21** *V. vulgaris* flights met their hover criterion of movement below 2 mm/frame, or 0.05 m/s. More commonly, wasps moved side to side before alighting, producing what the authors call a “jerky zigzag movement” ([Results “How much time…?” and Discussion](https://doi.org/10.1242/jeb.01932)). This supports short lateral inspection and deceleration, but not long stationary hovering.
- **Observed — feeder learning flight.** On first departure from a newly discovered feeder, *V. vulgaris* flew arcs roughly centred on the feeder, turned to face it near each arc's end, and arranged those inspection positions along outward-extending lines ([Collett & Lehrer 1993, abstract](https://doi.org/10.1098/rspb.1993.0056)).
- **Observed — feeder approach and turning.** In a later *Vespula* feeder experiment, arrivals first aimed at a nearby cylinder as a beacon, then adopted a preferred orientation that kept it at a more peripheral retinal position during the final segment. Departures used successive arcs with a mean angular velocity of **226°/s**; turns slowed at arc ends while wasps faced the feeder ([Collett 1995, abstract](https://doi.org/10.1007/BF00187632)).
- **Caveat.** Both Collett studies concern a learned **feeder**, not the nest entrance. They support a visual grammar—goal-centred arcs, frontal inspection, then a stable final approach—but do not establish how often routine nest arrivals loop, how long they hover, or exact landing distance.

#### Nest-specific evidence from solitary wasps

The closest quantified nest-departure choreography found is for solitary *Cerceris*, not any social wasp. After take-off, *Cerceris* used successively larger arcs; kept the nest about 30–70° from the visual midline and 45–60° below the horizon; turned at roughly 100–200°/s independent of nest distance; and increased ground speed with distance ([Zeil 1993, abstract](https://doi.org/10.1007/BF00189396)). A later three-dimensional reconstruction of *Cerceris australis* found that a learning flight begins by turning to face the entrance, then alternates arc reversals, sideways translations, and saccadic counterturning; arcs widen over the flight, with pivoting above 400°/s during fast transitions and about 100–200°/s during nest fixation ([Stürzl et al. 2016, Results “The Behavioral Organization of Learning Flights,” Figs. 1–2](https://doi.org/10.1016/j.cub.2015.12.052)).

A companion study of *Cerceris* return flights found that returning wasps did not retrace the departure path exactly, but both departures and returns used arcs with counterturning at similar angular velocities and faced in similar directions relative to the nest and nearby landmarks ([Zeil 1993, Part II abstract](https://doi.org/10.1007/BF00189397)). This supports an arc-and-counterturn motif during nest return/search, but still does not measure routine social-wasp approach or exact landing choreography.

**Animation transfer, explicitly inferred:** occasional expanding arcs while the sprite remains oriented toward the entrance are a defensible learning-flight motif. Applying the solitary-*Cerceris* angles or rates numerically to *Vespula*, *Vespa*, or *Polistes* would not be defensible. Use those values only as loose authoring references, not species measurements.

#### Hornets and paper wasps

- **Hornets:** the harmonic-radar study measures long-range field transit ground speed, while the flight-mill study measures sustained laboratory speed/capacity; neither measures hover, turns, landing, or nest learning ([Lioy et al. 2021](https://doi.org/10.1038/s41598-021-91541-4); [Sauvard et al. 2018](https://doi.org/10.1371/journal.pone.0198597)).
- **Paper wasps:** **Gap:** no primary *Polistes* nest-approach/landing kinematics suitable for numeric animation parameters was verified here.

Consequently, there is no evidence-based universal “wasp duty cycle,” dart probability, loop count, hover radius, or snap-turn duration. Those must remain **design controls**.

## Nest traffic: rates, rhythm, and visible counts

### Direct traffic evidence

| taxon | study and source location | result | scope |
| --- | --- | --- | --- |
| European hornet, *Vespa crabro* | One nest in southern Sweden; four nights and ten days in August–September 2009. Entries and exits were counted in 5-minute slots continuously around night and for 5 minutes each daylight hour ([Kelber et al. 2011, Methods “Animals and nest observations,” Fig. 1 caption](https://doi.org/10.1371/journal.pone.0021892)). | During bright hours, the Results text says an average of **15 hornets “left or entered” per 5 min**; Fig. 1C–D plots entering and leaving as separate bars, each near 15. The defensible reading is therefore about **15 per direction per 5 min**, or roughly **30 combined crossings per 5 min = 6/min**. Activity was fairly constant from about one hour before sunrise to one hour after sunset, rose somewhat in early evening, and declined below 1 cd/m² ([Results “Flight activity of Vespa crabro,” Fig. 1](https://doi.org/10.1371/journal.pone.0021892)). | One *Vespa* nest at one season/location; not a generic yellowjacket rate. |
| *Vespula* colonies | Malham et al. defined traffic rate as the mean of 1-minute counts of wasps **entering or leaving**—one direction, not combined—and related it to excavated worker count ([abstract](https://doi.org/10.1080/03014223.1991.10757956)). | `workers = 32.243 × one-direction crossings/min`, adjusted `R² = 0.87`. | Mainly mature colonies; authors warn it may overestimate spring worker count because a larger worker fraction forages then. It is a colony-size relation, not one universal traffic rate. |
| *Vespula arenaria* | Statistical analysis of one nest's entrance traffic ([Plowright 1979, abstract](https://doi.org/10.4039/Ent111385-4)). | Apparent temporal contagion in exits and sorties came from overall change in activity, not detected social facilitation between wasps. | Supports nonstationary rate modulation; the abstract does not provide a reusable crossing rate. |
| *Vespula germanica* | Field nests across locations in Mediterranean Australia ([Kasper et al. 2008, abstract](https://doi.org/10.1007/s00040-008-1004-7)). | Rain onset reduced foraging traffic by about **30%**, with immediate recovery after rain stopped. Daily activity averaged **22 min longer** than sunrise-to-sunset; low light and both low and high temperature restricted activity. | Climate and invasive-population specific; useful for rhythm, not an all-species rate. |
| *Polistes* paper wasps | **Gap:** no directly comparable entrance-crossing census was verified here. | No numeric rate. | Do not substitute hornet or yellowjacket traffic as a measured *Polistes* rhythm. |

### What “bursts” should mean

Plowright's result argues against portraying short clusters as a neighbour-triggered launch wave in routine *Vespula arenaria* traffic. A defensible generator is a **time-varying arrival process**: its baseline intensity changes gradually with daylight, temperature, rain, and colony activity; random short clusters can occur as a consequence of that changing intensity. This is an animation/model recommendation, not a claim that a specific point-process family was measured.

**Design implementation:** sample independent inbound and outbound event times from a nonstationary Poisson or renewal process, then smooth the rate envelope over tens of seconds or minutes. Add hard balancing only over long windows if the scene must avoid visually “draining” the nest. Do not schedule obligatory 2–4-wasp synchronized bursts as biological fact.

### Simultaneous airborne count: an explicit gap and a derivation

**Gap:** none of the suitable primary studies above is an airborne census of all wasps visible around a nest. Colony worker totals are not simultaneous airborne counts. The previous claim that “10–40 airborne agents are believable” is therefore unsupported and is rejected.

A transparent occupancy calculation is still possible:

`expected crossing agents in the entrance crop = crossing rate × chosen on-screen transit time`.

For the *V. crabro* daylight observation:

- observed combined rate `λ ≈ 6/min = 0.10/s`;
- choose a **design** entrance-crop transit time `τ = 2–5 s`;
- **derived** mean crossing occupancy `λτ ≈ 0.20–0.50 agents`.

At that measured rate, displaying 10 simultaneous traffic agents would require an average entrance-crop dwell of `10 / 0.10 = 100 s`, which is not supported by the observed traffic study. This does not rule out distant background insects, alarm activity, or another nest with a higher rate; it only shows that those agents cannot honestly be presented as a consequence of Kelber et al.'s baseline.

**Visible-count guidance:**

- **Design, routine entrance crop:** usually 0–1 actively crossing agents; permit 2 by chance.
- **Design, readable scene:** add 1–4 explicitly artistic local/orienting agents whose dwell is controlled separately from traffic.
- **Design, dense/alarm mode:** 10–40 may be an art direction, but label it alarm/aggregation or stylization. No primary airborne-count support was found for treating it as routine traffic.

## Algorithm survey

### 1. Steering behaviours and boids

Reynolds separates motion into action selection, steering, and locomotion, and defines lightweight composable steering behaviours for autonomous animated characters ([Reynolds 1999, Abstract and “Introduction”](https://www.red3d.com/cwr/steer/gdc99/)). The useful pieces here are:

- **Seek:** desired velocity points toward a target; steering is `desired_velocity - velocity` ([Reynolds 1999, section “Seek”](https://www.red3d.com/cwr/steer/gdc99/)). Use for an entrance, exit ray, or next path point.
- **Arrival:** seek at distance, then ramp desired speed toward zero inside a slowing radius ([Reynolds 1999, section “Arrival”](https://www.red3d.com/cwr/steer/gdc99/)). Use for approach deceleration; switch to a separate commit state before a literal stop.
- **Wander:** retain steering-direction state and perturb it slightly rather than drawing a new random force every frame; Reynolds notes coherent Perlin noise as an alternative ([Reynolds 1999, section “Wander”](https://www.red3d.com/cwr/steer/gdc99/)). Use only as bounded texture over goal-directed motion.
- **Path following:** steer inside a radius around a spine represented by a polyline or spline, allowing deviations rather than constraining the agent to a rail ([Reynolds 1999, section “Path following”](https://www.red3d.com/cwr/steer/gdc99/)). This directly fits authored approach and exit corridors.
- **Separation:** repel from nearby characters inside a local neighbourhood ([Reynolds 1999, section “Separation”](https://www.red3d.com/cwr/steer/gdc99/)). Use near the entrance to prevent sprite overlap.

The original boids model obtains aggregate flock motion from independent actors responding to local perception and simple individual behaviours ([Reynolds 1987, abstract](https://www.red3d.com/cwr/papers/1987/boids.html)). Reynolds' later formulation combines **separation, cohesion, and alignment** for flocking ([Reynolds 1999, section “Flocking”](https://www.red3d.com/cwr/steer/gdc99/)). No biological source in this review shows routine entrance traffic behaving as a coherent flock, so:

- keep **separation**;
- default **cohesion = 0** and **alignment = 0**;
- optionally add weak, short-lived same-corridor alignment as a **design** readability device, not observed wasp behaviour.

A direct all-pairs separation pass over 40 agents examines `40 × 39 / 2 = 780` unordered pairs per frame. That is a code-level arithmetic bound, not a biological claim; spatial partitioning is unnecessary unless profiling shows otherwise.

### 2. Coherent-noise wander

Perlin's original noise was introduced as a procedural texture primitive ([Perlin 1985, *An Image Synthesizer*, pp. 287–296](https://doi.org/10.1145/325165.325247)). His later first-party reference implementation computes gradient noise with a smooth fade polynomial and interpolation ([Perlin 2002, official “Improved Noise” code](https://cs.nyu.edu/~perlin/noise/)). Neither source claims to model wasps.

**Design use:** advance independent noise coordinates continuously and map the output to a small heading or lateral-offset perturbation. Do not feed absolute screen position from noise and call it navigation. Intent comes from the state target/path; noise supplies temporally coherent imperfection. Give each agent a distinct seed and sampling offset to avoid synchronized motion.

Reynolds' stateful random-walk wander is equally defensible and cheaper to explain. Choose one; stacking large random-walk and noise terms tends to erase the authored traffic direction.

### 3. Waypoints, paths, and splines

Use waypoints to encode semantic stages—off-screen origin, corridor entry, inspection point, entrance commit—not as points that every agent must hit exactly. Reynolds' path follower already defines the desirable “tube around a spine” behaviour and permits a spline or polyline spine ([Reynolds 1999, section “Path following”](https://www.red3d.com/cwr/steer/gdc99/)).

If an interpolating curve through authored points is useful, Catmull and Rom's original construction is the primary spline reference ([Catmull & Rom 1974, “A class of local interpolating splines,” pp. 317–326](https://doi.org/10.1016/B978-0-12-079050-0.50020-5)). Curve choice is not biological evidence. For this scene:

- use a straight segment or shallow curve for routine outbound transit;
- use 2–3 alternative inbound corridors so agents do not share one visible rail;
- reserve a short goal-centred arc path for the occasional learning/orienting state;
- steer toward a look-ahead point and allow noise within the corridor radius.

### 4. Creative-coding and implementation prior art

No original wasp-swarm repository with documented biological provenance was verified. Two insect/particle sketches and two canonical steering projects are still useful as primary **implementation artifacts**:

- Mariam Alkhoori's p5 Web Editor sketch **Swarm of Bees** is genuine insect-themed prior art. Its source creates five `BeeBoid` agents, applies Reynolds-style seek toward the nearest live flower, wraps at the canvas edges, and adds bees only when the hive is clicked ([published sketch](https://editor.p5js.org/mariamalkhoori/sketches/exMNOF-7n), [first-party project source API](https://editor.p5js.org/editor/mariamalkhoori/projects/exMNOF-7n)). It has no separation, arrival, nest-traffic scheduler, or behavioural state machine, so it demonstrates readable target-seeking sprites rather than a reusable social-wasp model.
- Gene Kogan's original p5.js **swarm** sketch uses attraction, repulsion, decaying velocity, and trail rendering in a particle system ([source tree](https://github.com/genekogan/p5js-sketches/tree/master/swarm), [`particle.js`](https://github.com/genekogan/p5js-sketches/blob/master/swarm/particle.js)). It is not insect-specific and has no nest traffic; its transferable idea is visual motion trails/force fields, not biology.
- Reynolds' open-source **OpenSteer** project demonstrates autonomous-character steering and is the source-project companion to the steering literature ([OpenSteer repository](https://github.com/meshula/OpenSteer)).
- Daniel Shiffman's original p5.js example implements seek plus all-pairs separation, alignment, and cohesion and labels its force weights arbitrary ([`NOC_6_09_Flocking/boid.js`](https://github.com/shiffman/The-Nature-of-Code-Examples-p5.js/blob/master/chp06_agents/NOC_6_09_Flocking/boid.js)); the same repository includes seek, arrival, path-following, and separation examples ([chapter 6 source tree](https://github.com/shiffman/The-Nature-of-Code-Examples-p5.js/tree/master/chp06_agents)).

These are **code prior art**, not biological sources. Reuse their vector/update and rendering patterns, not their flock weights, wraparound worlds, attraction fields, or global cohesion as wasp defaults.

## Recommended motion recipe

### Scheduler

1. Maintain separate inbound and outbound rate envelopes.
2. For a literal rendering of the observed *V. crabro* nest, start the **combined** daylight rate at about `0.10 events/s`—approximately `0.05/s` inbound and `0.05/s` outbound—and treat all other rate profiles as species/scene-specific **design** inputs ([Kelber et al. 2011, Results and Fig. 1](https://doi.org/10.1371/journal.pone.0021892)).
3. Modulate the envelope gradually. A *V. germanica*-specific weather preset may reduce rate by about 30% during rain and recover after rain, but do not silently transfer that number to hornets or paper wasps ([Kasper et al. 2008, abstract](https://doi.org/10.1007/s00040-008-1004-7)).
4. Generate event times independently from the envelope. Do not force coordinated bursts; *V. arenaria* evidence attributes apparent contagion to overall activity change rather than detected social facilitation ([Plowright 1979, abstract](https://doi.org/10.4039/Ent111385-4)).
5. Spawn long-dwell local/orienting agents from a separate artistic budget, so entrance-flow evidence and visual density remain auditable.

### Per-agent states

| state | entry | motion | exit |
| --- | --- | --- | --- |
| `outbound_commit` | outbound traffic event | launch from entrance, accelerate along one of several shallow exit corridors; little wander | clear the entrance radius |
| `outbound_transit` | commit complete | path-follow/seek an off-screen point; low noise; no cohesion | leave viewport |
| `inbound_transit` | inbound traffic event | follow one of several approach corridors toward a look-ahead point | enter approach radius |
| `approach_inspect` | near entrance | arrival steering plus one short lateral reversal/arc; keep visual orientation biased toward entrance | commit timer or alignment threshold met |
| `inbound_commit` | approach accepted | reduce wander and separation, accelerate gently through the opening, then despawn | cross entrance plane |
| `learning_orient` | **design:** occasional departure only | 1–3 widening arcs centred on entrance with sprite facing/biased toward it; numbers are artistic | join outbound transit |
| `local_loiter` | separate artistic spawn | bounded path/noise around a local anchor; never counted as a crossing | short lifetime, then inbound or off-screen |

`approach_inspect` is inspired by *Vespula* feeder arrivals and must not be described as a measured routine nest-landing sequence ([Golding et al. 2005](https://doi.org/10.1242/jeb.01932); [Collett 1995](https://doi.org/10.1007/BF00187632)). `learning_orient` transfers a motif seen at *Vespula* feeders and solitary-*Cerceris* nests, with the species/context caveats above.

### Starting parameters

Every uncited number in this table is deliberately marked **Design**. They are readable starting points for a roughly 1600 px-wide canvas, not pseudo-measurements.

| control | start | basis/status |
| --- | ---: | --- |
| routine combined traffic rate | `0.10 events/s` | **Observed only for one daylight *V. crabro* nest**; about 0.05/s per direction in Kelber et al. Fig. 1. Replace for other species/context. |
| simultaneous crossing agents | usually `0–1`, permit `2` | **Derived/design** from `λτ` with `τ = 2–5 s`; not an airborne census. |
| independent local/orienting agents | `1–4` | **Design** visual budget, explicitly separate from traffic. |
| routine cruise speed | `0.18 viewport-width/s` (`288 px/s` at 1600 px) | **Design** because scene metre scale is unknown. |
| approach speed | `0.35–0.60 × cruise` | **Design**; qualitative deceleration supported at *Vespula* flower/feeder approaches, ratio unmeasured. |
| departure speed after commit | `1.0–1.25 × cruise` | **Design**; no social-wasp nest ratio found. |
| dart/escape speed | `1.6–2.2 × cruise`, event-driven only | **Design**; no defensible routine dart rate found. Do not schedule random darts as a measured duty cycle. |
| steering acceleration cap | `1.2 viewport-width/s²` | **Design**; prevents instantaneous velocity flips. |
| ordinary turn-rate cap | `180°/s` | **Design**, placed near the 100–226°/s values measured in other learning-flight contexts; not a species measurement. |
| brief corrective turn cap | `360°/s` | **Design**, below the >400°/s transition reported for solitary *C. australis*; not a social-wasp measurement. |
| approach/arrival radius | `4–7 sprite lengths` | **Design**; scale with sprite, not viewport. |
| entrance commit radius | `1–2 sprite lengths` | **Design**. |
| lateral inspection amplitude | `0.5–1.5 sprite lengths` | **Design**; side-to-side behaviour is observed, amplitude was not measured in the cited social-wasp paper. |
| inspection duration | `0.15–0.60 s` | **Design**; keep brief because sustained hovering was rare in Golding et al.'s flower context. |
| learning-orient frequency | `5–15%` of departures | **Design**; no routine social-nest frequency was found. Expose as a preset, not truth. |
| learning-orient arcs | `1–3`, widening | **Design count**; widening goal-centred arcs are observed in cited learning-flight studies. |
| noise heading amplitude | `4–12°` | **Design**. |
| noise sampling rate | `0.3–0.8 cycles/s` | **Design**. |
| separation radius | `1.25–2 sprite lengths` | **Design**. |
| separation/cohesion/alignment weights | `0.8 / 0 / 0` after normalization | **Design**; only local overlap prevention is wanted. |
| inbound corridor variants | `3` | **Design**; avoids a visible rail. |
| traffic-rate envelope smoothing | `20–60 s` | **Design**; represents changing activity without fabricated synchronized bursts. |

### Update order

For each animation step:

1. advance the traffic-rate envelope and emit due crossing events;
2. transition agent states;
3. choose the state target or path look-ahead point;
4. compute seek/arrival/path-following intent;
5. add bounded coherent wander;
6. add local separation, except during the final entrance commit if it would block crossing;
7. clamp acceleration, speed, and turn rate;
8. integrate with delta time;
9. orient the sprite mostly to velocity, with entrance-facing bias only in inspect/learning states;
10. record actual crossings and visible occupancy so the rendered traffic can be checked against the configured rate.

### Acceptance test for the eventual animation

Over a 10-minute deterministic-seed run of the hornet-daylight preset:

- the event log should average approximately 60 combined crossings because `6/min × 10 min = 60` (**derived from Kelber et al.; allow stochastic variation unless the test fixes exact scheduling**);
- most frames in a tight entrance crop should contain zero crossing agents, with occasional one and rare overlap of two (**derived/design, dependent on chosen transit duration**);
- inbound agents should visibly decelerate and may make a brief lateral inspection;
- outbound agents should generally clear the entrance directly, with only the configured minority entering a widening learning/orient path;
- no persistent global alignment or cohesion should appear;
- changing the artistic loiterer count must not change logged entrance crossings.

## Evidence gaps that must remain gaps

No suitable primary source verified here provides:

- a near-entrance free-flight speed distribution for routine *Vespula*, *Vespa*, and *Polistes* traffic under comparable conditions (Lioy et al. measure long-range *V. velutina* field transit only);
- a measured dart frequency or cruise/hover/dart duty cycle for routine social-wasp traffic;
- exact routine social-wasp nest-landing loop counts, hover radii, or approach distances;
- a simultaneous airborne census around a nest that supports 10–40 visible agents;
- a directly comparable *Polistes* entrance traffic rate or landing-kinematics dataset;
- biological evidence for using full boids cohesion/alignment at a routine nest entrance.

Those quantities should remain named controls in implementation and documentation, never silently promoted to measurements.

## References

1. Golding, Y. C., Edmunds, M., & Ennos, A. R. (2005). “Flight behaviour during foraging of the social wasp *Vespula vulgaris* …” *Journal of Experimental Biology* 208, 4523–4527. <https://doi.org/10.1242/jeb.01932>
2. Collett, T. S., & Lehrer, M. (1993). “Looking and learning: a spatial pattern in the orientation flight of the wasp *Vespula vulgaris*.” *Proceedings of the Royal Society B* 252, 129–134. <https://doi.org/10.1098/rspb.1993.0056>
3. Collett, T. S. (1995). “Making learning easy: the acquisition of visual information during the orientation flights of social wasps.” *Journal of Comparative Physiology A* 177, 737–747. <https://doi.org/10.1007/BF00187632>
4. Zeil, J. (1993). “Orientation flights of solitary wasps (*Cerceris*; Sphecidae; Hymenoptera). I. Description of flight.” *Journal of Comparative Physiology A* 172, 189–205. <https://doi.org/10.1007/BF00189396>
5. Stürzl, W., Zeil, J., Boeddeker, N., & Hemmi, J. M. (2016). “How Wasps Acquire and Use Views for Homing.” *Current Biology* 26, 470–482. <https://doi.org/10.1016/j.cub.2015.12.052>
6. Sauvard, D., Imbault, V., & Darrouzet, É. (2018). “Flight capacities of yellow-legged hornet (*Vespa velutina nigrithorax*) workers from an invasive population in Europe.” *PLOS ONE* 13, e0198597. <https://doi.org/10.1371/journal.pone.0198597>
7. Kelber, A., Jonsson, F., Wallén, R., Warrant, E., Kornfeldt, T., & Baird, E. (2011). “Hornets Can Fly at Night without Obvious Adaptations of Eyes and Ocelli.” *PLOS ONE* 6, e21892. <https://doi.org/10.1371/journal.pone.0021892>
8. Malham, J. P., Rees, J. S., Alspach, P. A., Beggs, J. R., & Moller, H. (1991). “Traffic rate as an index of colony size in *Vespula* wasps.” *New Zealand Journal of Zoology* 18, 105–109. <https://doi.org/10.1080/03014223.1991.10757956>
9. Plowright, R. C. (1979). “Traffic through the nest entrance of a colony of *Vespula arenaria*.” *The Canadian Entomologist* 111, 385–390. <https://doi.org/10.4039/Ent111385-4>
10. Kasper, M. L., Reeson, A. F., Mackay, D. A., & Austin, A. D. (2008). “Environmental factors influencing daily foraging activity of *Vespula germanica* in Mediterranean Australia.” *Insectes Sociaux* 55, 288–295. <https://doi.org/10.1007/s00040-008-1004-7>
11. Reynolds, C. W. (1987). “Flocks, Herds, and Schools: A Distributed Behavioral Model.” *Computer Graphics* 21(4), 25–34. Author-hosted paper: <https://www.red3d.com/cwr/papers/1987/boids.html>
12. Reynolds, C. W. (1999). “Steering Behaviors for Autonomous Characters.” Game Developers Conference. Author-hosted paper: <https://www.red3d.com/cwr/steer/gdc99/>
13. Perlin, K. (1985). “An Image Synthesizer.” *Computer Graphics* 19(3), 287–296. <https://doi.org/10.1145/325165.325247>; first-party improved-noise reference code (2002): <https://cs.nyu.edu/~perlin/noise/>
14. Catmull, E., & Rom, R. (1974). “A class of local interpolating splines.” In *Computer Aided Geometric Design*, 317–326. <https://doi.org/10.1016/B978-0-12-079050-0.50020-5>
15. Reynolds, C. W., et al. OpenSteer source repository. <https://github.com/meshula/OpenSteer>
16. Shiffman, D. *The Nature of Code* p5.js source examples, chapter 6. <https://github.com/shiffman/The-Nature-of-Code-Examples-p5.js/tree/master/chp06_agents>
17. Alkhoori, M. “Swarm of Bees,” p5 Web Editor source project. <https://editor.p5js.org/mariamalkhoori/sketches/exMNOF-7n>
18. Kogan, G. “swarm,” p5.js source sketch. <https://github.com/genekogan/p5js-sketches/tree/master/swarm>
19. Lioy, S., et al. (2021). “Tracking the invasive hornet *Vespa velutina* in complex environments by means of a harmonic radar.” *Scientific Reports* 11, 12143. <https://doi.org/10.1038/s41598-021-91541-4>
20. Zeil, J. (1993). “Orientation flights of solitary wasps (*Cerceris*; Sphecidae; Hymenoptera). II. Similarities between orientation and return flights and the use of motion parallax.” *Journal of Comparative Physiology A* 172, 207–222. <https://doi.org/10.1007/BF00189397>
