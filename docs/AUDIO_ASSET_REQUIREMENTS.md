# AUDIO ASSET REQUIREMENTS — Phase 17

**No audio files ship in this phase, and none were generated.** The complete
audio _system_ ships — `AudioDirector` (category lanes, ducking, throttle,
pitch variation, distance fade, 24-source ceiling), the event wiring, the
settings panel, the lazy loader — and every file it expects is listed here as
external production work, exactly as the image debt lives in the prompt
catalog. The agent cannot produce audio and did not fake any.

## How delivery works (no code change needed)

Drop files under `public/audio/` as `<id>.ogg` **and** `<id>.m4a`
(ASSET_PIPELINE §11: OGG primary, M4A for Safari), then list the delivered ids
in `public/audio/manifest.json`:

```json
{ "files": ["coin", "bell_ready", "sizzle"] }
```

The scene fetches the manifest after the first playable frame (lazy — the
roadmap's own deployment rule), loads what it names, and the director starts
honouring events. Partial delivery is fine: unlisted keys stay silent no-ops.

**Normalisation:** SFX −16 LUFS, music −20 LUFS (§11). **Budget: ≤ 5 MB total.**

## The catalogue

Categories and behaviour are `src/config/audio.ts`; this table is its
production view. Durations are targets, loops must be seamless.

| id             | category    | need                                                       | duration | loop | source route (§11) |
| -------------- | ----------- | ---------------------------------------------------------- | -------- | ---: | ------------------ |
| amb_day        | ambience    | daytime bed: distant traffic, birds                        | 30–60 s  |    ✓ | library (CC0) / AI |
| amb_night      | ambience    | night bed: crickets, sparse cars                           | 30–60 s  |    ✓ | library / AI       |
| traffic_bed    | ambience    | road hum, mixed by density at runtime                      | 30–60 s  |    ✓ | library / AI       |
| engine_pass    | world       | one car passing                                            | ~1.5 s   |    — | library / AI       |
| brake          | world       | short brake, no screech                                    | ~0.8 s   |    — | library / AI       |
| door           | world       | light commercial door                                      | ~0.6 s   |    — | library / AI       |
| footstep       | world       | single soft step on tarmac                                 | ~0.3 s   |    — | library / AI       |
| sizzle         | kitchen     | grill loop                                                 | 4–8 s    |    ✓ | AI / library       |
| fryer          | kitchen     | fryer bubble loop                                          | 4–8 s    |    ✓ | AI / library       |
| bell_ready     | kitchen     | counter bell, one strike                                   | ~0.7 s   |    — | AI / library       |
| plate          | kitchen     | plate set down                                             | ~0.5 s   |    — | AI / library       |
| chatter_happy  | customer    | wordless satisfied vocalisation (dilsiz — never localised) | ~0.8 s   |    — | AI                 |
| chatter_upset  | customer    | wordless annoyed vocalisation                              | ~0.8 s   |    — | AI                 |
| ui_click       | ui          | soft click                                                 | ~0.15 s  |    — | AI / synth         |
| ui_confirm     | ui          | small confirm                                              | ~0.3 s   |    — | AI / synth         |
| ui_error       | ui          | gentle refusal                                             | ~0.3 s   |    — | AI / synth         |
| coin           | ui          | short coin ring                                            | ~0.4 s   |    — | AI / synth         |
| upgrade_bought | progression | warm build chord — rare, must feel earned                  | ~1.5 s   |    — | AI                 |
| stage_evolved  | progression | the big one; the only fanfare in the game                  | ~3 s     |    — | AI                 |
| milestone      | progression | between the two above                                      | ~1.5 s   |    — | AI                 |
| music_day      | music       | light daytime loop                                         | 60–120 s |    ✓ | AI                 |
| music_evening  | music       | warmer evening loop                                        | 60–120 s |    ✓ | AI                 |
| music_night    | music       | sparse night loop                                          | 60–120 s |    ✓ | AI                 |

23 files × 2 formats = 46 deliverables inside the 5 MB budget
(§11's per-category sizes are the split that fits).

## Contracts the system already enforces

- Same SFX never retriggers inside 400 ms; ±6% pitch variation on one-shots.
- Progression sounds duck ambience and music (0.35, 120 ms attack / 600 ms release).
- World/kitchen/customer sounds fade over 8→34 m from the lot centre.
- Hard ceiling of 24 concurrent sources.
- **Zero-information rule:** the game is fully playable at zero volume —
  asserted by `tests/e2e/audioSettings.spec.ts`, which plays two silent
  game-hours by hand and watches the till.

## Licence gate

The AI-audio route inherits `assets/LICENSES.md` §1.5's scope: the executive
override covers the MVP; reopen the verification before monetisation (P16
follow-up, P23) for whatever tool produces these files.
