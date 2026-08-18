# PLAYTEST PROTOCOL — Evolutionary Tycoon

**Version:** 1.0 · **Written:** 2026-08-18 · **Status:** prepared, **NOT RUN**

> **This document does not contain results.** It is the instrument. Results go in a copy of
> [`PLAYTEST_RESULTS_TEMPLATE.md`](PLAYTEST_RESULTS_TEMPLATE.md), one per session, and nothing may be
> written into one that a person did not say or do.
>
> An agent cannot run this. WORKING_DISCIPLINE §11 makes inventing a player observation the one
> irreversible violation, and a simulated playtest is exactly that with extra steps. The requirement
> stands open until three people have played for an hour each.

---

## 1. What this is for

ECONOMY_DESIGN §15 and roadmap Phase 12 both require **three players × one hour** before the economy
can be called validated. The balance simulator answers "does the economy stay inside its envelope";
it cannot answer any of these:

| Question                                       | Only a person can answer it because                               |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Did you know what to do in the first minute?   | The simulator always knows what to do.                            |
| Was the wait boring, or was it tension?        | Both are the same number of seconds.                              |
| Did you understand why that customer left?     | The event log records that they left; comprehension is not in it. |
| Would you have bought that upgrade?            | Policies buy by rule. A rule cannot be _tempted_.                 |
| Did the stage change feel earned?              | Progression time is measurable; earning is not.                   |
| Could you tell the employee from the customer? | The renderer knows which is which by construction.                |

The five **art-dependent judgements** carried since Phase 6 are in the same category and are listed
in §7. They are the reason this protocol was not worth running before the production art landed.

---

## 2. Who, and how many

**Minimum for the gate: three players, one hour each, no two from the same group below.**

| Group               | Why they are needed                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| **Tycoon-literate** | Has played a management game. Tells you whether the genre's conventions are met or violated.    |
| **Genre-naive**     | Has not. Tells you what the game fails to explain, which the literate player fills in silently. |
| **Returning**       | Has seen an earlier build. The only person who can say whether the evolution _reads_ as growth. |

No developer of the project counts toward the three. A person who has read this document does not
count as genre-naive.

---

## 3. What the observer does

**Setup, before the player arrives**

- [ ] Build and serve the version under test; record the SHA from `/health.json` in the results file.
- [ ] Confirm `data-asset-state` is `loaded` and `data-asset-placeholders` is `0` on first paint.
- [ ] Open the browser console and leave it open **on a second screen**, not the player's.
- [ ] Start a screen recording if the player consents; note in the results file if they did not.
- [ ] Have `PLAYTEST_RESULTS_TEMPLATE.md` open and the clock ready.

**During**

- [ ] **Say nothing.** The single most expensive thing an observer can do is answer a question. If
      the player asks one, write the question down and say "I want to see what you do next."
- [ ] Timestamp every event in §4 as it happens. A time you reconstruct afterwards is a guess.
- [ ] Note **what the player looked at**, not only what they clicked. A player hunting for the cash
      figure has already told you the HUD is wrong.
- [ ] Do not pause to fix anything. A crash ends the session and is recorded as one.

**After**

- [ ] Ask §5's questions in order, verbatim, before discussing anything.
- [ ] Read the console back and record every error, with the time it occurred.
- [ ] Write the results file **before** the next session. Two sessions in memory become one memory.

---

## 4. The timeline to record

Absolute times from first paint. Blank means it did not happen, which is data.

| Event                                  | Time | Note                                                    |
| -------------------------------------- | ---- | ------------------------------------------------------- |
| First deliberate action                |      | Not a stray click — the first thing they _meant_ to do. |
| First upgrade opened                   |      |                                                         |
| First upgrade **bought**               |      |                                                         |
| First time they said they were waiting |      | Their words, not your inference.                        |
| First customer they noticed leaving    |      | Did they say why?                                       |
| First employee hired                   |      |                                                         |
| Stage 2 reached                        |      | Compare against the balance sim's 10–22 min window.     |
| First use of the speed control         |      | Which speed, and what prompted it.                      |
| First time they zoomed or panned       |      |                                                         |
| Stage 3 reached                        |      |                                                         |
| Drive-thru first used                  |      |                                                         |
| Session end                            |      | Did they stop, or did the hour stop them? Not the same. |

---

## 5. The questions, asked afterwards, in this order

Order matters: the open questions come first, because a specific question teaches the player what you
were looking for and contaminates everything after it.

**Open**

1. Tell me what you were doing, in your own words.
2. What were you trying to achieve when you stopped?
3. Was there a moment you were confused? Take me to it.
4. Was there a moment you were bored? What were you waiting for?

**Comprehension**

5. Did you know what to do when it started? What told you?
6. What made a customer leave?
7. What does an employee do that you could not do yourself?
8. **What would you buy next, and why?** — the question ECONOMY_DESIGN §15 names specifically.
9. What do you think happens at the next stage?

**Readability** — ask these while the game is on screen, and let them point.

10. Point at a customer. Point at an employee. How did you tell?
11. Which car is about to stop? How can you tell?
12. Is that customer happy? Where are you reading that?
13. Which of these is the kitchen?
14. Is this the same place it was at the start? What tells you?

**Value**

15. Was the last upgrade you bought worth it? How do you know?
16. Did the stage change feel like something you earned?
17. **Did you want to keep playing?** If the hour had not ended, would you have?
18. Would you play this again tomorrow? Say no if the answer is no.

---

## 6. What gets counted

A finding needs **two of three** players to become a change request. One player's confusion is a
data point; two is a defect. Record all of it either way — a single player's blocker can still be
severe enough to act on, and that judgement is made with the count visible, not instead of it.

| Severity    | Meaning                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| **Blocker** | The player could not proceed, or stopped playing because of it.             |
| **Major**   | The player proceeded but misunderstood, and the misunderstanding cost them. |
| **Minor**   | Noticed, mentioned, did not change what they did.                           |
| **Polish**  | The observer noticed; the player did not.                                   |

---

## 7. The art-dependent judgements

Five, carried since Phase 6 and marked **NOT JUDGED: AWAITING EXTERNAL ART** in every report since.
The art landed on 2026-08-18. An agent visual review is recorded in
`docs/FINAL_PRE_NEXT_BATCH_REPORT.md` under that exact label — it is not a substitute, and these
still need people.

| #   | From | The judgement                                                             | Question that gets at it |
| --- | ---- | ------------------------------------------------------------------------- | ------------------------ |
| 1   | P6   | Does the conversion moment read — can you see a driver _decide_ to stop?  | 11                       |
| 2   | P7   | Do the pedestrians move naturally, or like units?                         | 3, 10                    |
| 3   | P8   | Is the order → cook → deliver → pay loop satisfying to watch?             | 1, 4                     |
| 4   | P10  | Can you tell what an employee is _intending_ to do?                       | 7, 10                    |
| 5   | P11  | Are the four stage silhouettes distinct, and recognisably the same place? | 14, 16                   |

---

## 8. Session checklist

```
[ ] Build SHA recorded from /health.json
[ ] data-asset-placeholders = 0 confirmed before the player sat down
[ ] Console open, on the observer's screen
[ ] Recording consent asked and recorded either way
[ ] Player group recorded (§2)
[ ] Observer said nothing for the full hour
[ ] Timeline (§4) filled in live
[ ] Questions (§5) asked in order, verbatim, before any discussion
[ ] Console errors read back and recorded with times
[ ] Results file written before the next session
[ ] Findings counted across players (§6) only after all three sessions
```

---

## 9. Honest status

**NOT RUN.** No session has taken place. No player has seen this build.

`docs/PROJECT_MEMORY.md` §21 carries this as open, and it stays open until three completed results
files exist under `docs/playtests/`. Nothing in this repository may describe the economy as
validated until then.
