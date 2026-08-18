# PLAYTEST RESULTS — session &lt;n&gt;

> Copy this file to `docs/playtests/YYYY-MM-DD-<player-initials>.md` and fill it in. Follow
> [`PLAYTEST_PROTOCOL.md`](PLAYTEST_PROTOCOL.md).
>
> **Write only what happened.** A blank is data — it means the thing did not occur, or you did not
> see it, and both are worth more than a plausible entry. If you are tempted to write what the
> player "probably" meant, write what they actually said instead and put your reading in
> §7 as the observer's, labelled as yours.

---

## 0. Session

| Field                              | Value |
| ---------------------------------- | ----- |
| Date                               |       |
| Build SHA (`/health.json`)         |       |
| Preview or local URL               |       |
| Player group (§2)                  |       |
| Minutes played                     |       |
| Observer                           |       |
| Screen recording?                  |       |
| `data-asset-placeholders` at start |       |
| Anything unusual about the setup   |       |

---

## 1. Timeline

Absolute minutes from first paint. Blank = did not happen.

| Event                                  | Time | Note |
| -------------------------------------- | ---- | ---- |
| First deliberate action                |      |      |
| First upgrade opened                   |      |      |
| First upgrade **bought**               |      |      |
| First time they said they were waiting |      |      |
| First customer they noticed leaving    |      |      |
| First employee hired                   |      |      |
| Stage 2 reached                        |      |      |
| First use of the speed control         |      |      |
| First zoom or pan                      |      |      |
| Stage 3 reached                        |      |      |
| Drive-thru first used                  |      |      |
| Session end                            |      |      |

**Did they stop, or did the hour stop them?**

---

## 2. What they said, unedited

Quotes. Not summaries. Timestamp each one.

| Time | What they said |
| ---- | -------------- |
|      |                |

---

## 3. Questions

Answers in their words. If they did not answer, write that.

| #   | Question                                             | Answer |
| --- | ---------------------------------------------------- | ------ |
| 1   | What were you doing?                                 |        |
| 2   | What were you trying to achieve when you stopped?    |        |
| 3   | A moment you were confused?                          |        |
| 4   | A moment you were bored? Waiting for what?           |        |
| 5   | Did you know what to do at the start? What told you? |        |
| 6   | What made a customer leave?                          |        |
| 7   | What does an employee do that you could not?         |        |
| 8   | **What would you buy next, and why?**                |        |
| 9   | What happens at the next stage?                      |        |
| 10  | Customer vs employee — how did you tell?             |        |
| 11  | Which car is about to stop? How can you tell?        |        |
| 12  | Is that customer happy? Where do you read it?        |        |
| 13  | Which of these is the kitchen?                       |        |
| 14  | Is this the same place it was at the start?          |        |
| 15  | Was the last upgrade worth it? How do you know?      |        |
| 16  | Did the stage change feel earned?                    |        |
| 17  | **Did you want to keep playing?**                    |        |
| 18  | Would you play again tomorrow?                       |        |

---

## 4. The five art-dependent judgements

Carried since Phase 6 (PLAYTEST_PROTOCOL §7). Answer from what the player said and did, not from
what you can see.

| #   | Judgement                                         | Verdict | Evidence from this session |
| --- | ------------------------------------------------- | ------- | -------------------------- |
| 1   | The conversion moment reads                       |         |                            |
| 2   | Pedestrians move naturally                        |         |                            |
| 3   | The service loop is satisfying to watch           |         |                            |
| 4   | Employee intent is legible                        |         |                            |
| 5   | Stage silhouettes are distinct and the same place |         |                            |

---

## 5. Findings

| Severity | What happened | Time | Their words | Repro? |
| -------- | ------------- | ---- | ----------- | ------ |
|          |               |      |             |        |

Severity is **Blocker / Major / Minor / Polish** — PLAYTEST_PROTOCOL §6. A finding becomes a change
request when **two of three** players hit it; that count is made after all three sessions, not here.

---

## 6. Console and technical

| Time | Message | What the player was doing |
| ---- | ------- | ------------------------- |
|      |         |                           |

- [ ] Any crash? Describe and mark the session ended if so.
- [ ] Any visible placeholder or missing sprite? Screenshot it.
- [ ] Any stutter the player noticed? Their words, and what was on screen.

---

## 7. Observer's own reading

Clearly separated from §2–§5, which are the player's. Your interpretation is useful and it is
**not evidence**; keeping the two apart is what makes the rest of this file trustworthy.

---

## 8. Sign-off

- [ ] Written before the next session started
- [ ] Nothing in §1–§6 is an inference
- [ ] Every blank is a real blank, not an omission
- [ ] Findings counted only after all three sessions

Observer: ______________________ Date: __________
