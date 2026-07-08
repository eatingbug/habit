# Habit System — Product Specification

**Tagline:** Build the Habit, Grow yourself
**Status:** Draft v3.3 (MVP scope) · updated 2026-07-08 (recording review: scoped fairness + engagement streak, log-time reward, proactive never-miss-twice save, visible weekly growth, skip-reasons drive diagnosis; minimal adaptive Linear/Notion visual language)
**Working name:** Habiquest (candidate, not final)

---

## 1. Problem & Thesis

People fail to sustain habits not because they lack willpower, but because they
never build a working *system*. Sustained behavior is a system-design problem,
not a motivation problem.

This is supported by established behavioral science: Fogg's Behavior Model
(B = MAP: Behavior = Motivation × Ability × Prompt), Clear's habit laws, and
Wood's automaticity research all point the same way. Note that habit formation
takes ~66 days on average (range 18–254, Lally 2010), not the popular "21 days,"
and the variance is driven by behavior difficulty — i.e., by design.

A frequently overlooked corollary: **running too many habits at once is itself a
design failure.** No amount of per-habit tuning fixes an overloaded portfolio.
The system therefore diagnoses not only *inside* each habit but *across* them
(see §8).

**Core product belief:** The product's job is to build a *scientific system for
forming habits*, not to be a points game wearing a habit-tracker costume.

---

## 2. The Closed Loop (architecture of the whole product)

The product is **one closed loop**, not two parallel modules ("design system" +
"record system"). The loop mirrors the learning cycle:

> **Design (hypothesis) → Perform → Record (data) → Reflect (update hypothesis) → back to Design**

The key insight: people fail because their *initial design was wrong and never
got corrected*, not because they failed to log. Therefore **the purpose of
recording is to produce data that updates the design** — not to accumulate
entries. A record that is never re-read is a dead record.

Treat the user's own behavior scientifically: **design = hypothesis, records =
data, reflection = hypothesis update.** Whether this loop *closes* is the real
test of "scientific habit system." If it doesn't close, it's just a pretty
journal.

```
        ┌────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
   [1] DESIGN ──────► [2] PERFORM ──────► [3] RECORD    │
   (hypothesis)        (do the habit)     (collect data)│
                                              │         │
                                              ▼         │
                                        [4] REFLECT ────┘
                                        (update hypothesis)
```

**MVP weight:** The hardest, least-solved step — and where this product places
its primary bet — is **Step 4: reviving records in reflection.** Most habit apps
let you design once and log forever, but never resurface the data to change the
design.

---

## 3. Core Concepts (shared vocabulary)

### 3.1 Measurement — two kinds (count vs yes/no)

A habit is recorded in one of two ways, chosen at creation:

- **Count / amount** — a numeric measure with a floor / target / actual (below).
- **Yes / No (binary)** — a simple did-it / didn't. No amount to hit: a logged day
  is "done"; there is no "over" and no above-floor intensity. Modeled as a count
  habit with floor = 1 and no target (each "done" = 1), so it reuses the same entry
  states and consistency math — it just measures **consistency only**.

For **count** habits:
- **Floor** — the can't-possibly-fail minimum (2-minute rule). Hitting the floor
  = "done today" = streak kept + base XP. Measures **consistency**.
- **Target** *(optional)* — the daily stretch goal. Exceeding it grants bonus XP.
  Never required — making it required would punish floor-only days.
- **Actual** — what the user actually did. Above-floor actual converts into XP
  (intensity). Measures **intensity**.

### 3.2 Day states (per day, per habit) — computed, not logged
A day can hold **several entries** (you log as you go — see §5, Stage 2). What you
*record* is the raw fact (an amount, or a skip-with-reason); the **state of the day**
is *computed* by summing that day's activity. Distinguishing these states keeps the
diagnosis engine clean:
- **done** — the day's total met the floor.
- **over** — the day's total exceeded the target (count habits only; feeds intensity).
- **partial** — you logged real activity but the total fell short of the floor.
- **skip** — the day was explicitly marked not-done, *with a reason* (no real
  activity that day).
- **blank** — no entry at all. Treated as **unknown**.

Yes/No habits use only **done** / **skip** / **blank** — they have no **over** or
**partial** (any "done" is the whole floor).

**Neither blank nor partial is a miss.** Only **skip** (with a non-exception reason)
counts as a miss for diagnosis. Excluding *blank* prevents forgotten logging from
poisoning the diagnosis (a false "you keep missing Tuesdays"). Excluding *partial*
upholds a fairness rule, scoped precisely: **honestly logging that you fell short must
never be worse for you than logging nothing — for XP, streak, or miss-count.** A partial
day still *informs* the design: it deliberately lowers your floor-completion rate, which
is exactly the "your floor may be too high" signal. That lowering is help, not a penalty,
so it must not leak into places where a lower rate would *cost* you (being demoted out of
Established, §3.3 — see SPEC §4.4/§4.7). And a partial day is made *strictly better* than
a blank one by the **engagement ("showed up") streak** (§10), which rewards showing up
without granting XP. Trade-off: a genuine miss the user never marks stays unknown — we
accept under-counting for clean signal, and mitigate it with easy backfill (§5).

### 3.3 Habit lifecycle
- **Forming** — still establishing; goal is floor consistency. XP / streak / the "showed
  up" streak / nudges are foreground, and the UI **sets the ~66-day expectation** (Lally,
  §1) with progress measured by accumulated repetitions, not the calendar — so a slow
  stretch reads as "still forming," not "failing."
- **Established** — automaticity reached; floor is effectively automatic. The
  product shifts to **monitoring mode**: the new focus is the *actual trend*
  (growing / flat / declining), not daily encouragement.
- **Paused** — temporarily set aside (see §8). An exit that is *not* deletion.

Transitions: Forming → Established (on sustained floor consistency); either →
Paused; Established → Forming (demotion if it starts slipping).

---

## 4. Product Surfaces (UI map)

**Visual language:** clean, minimal, adaptive light + dark (Linear/Notion family). The
game layer (XP, levels, streaks, lights) stays but is rendered *quietly* — thin progress
bars, muted stat chips, small status dots — not a gold RPG skin (principle 2). See SPEC
§6.0 / the mockup `mvp/habiquest-linear.html`.

1. **Dashboard** — a restrained character sheet: stat levels + thin XP bars, per-habit
   heatmap, a **one-tap log on each row** (§5), and **always-on status lights** (§7) that
   route attention to habits needing action.
2. **Today** — chronological feed of the day (habit entries + free logs) with a unified
   composer (§9), immediate log-time reward, and the never-miss-twice save banner.
3. **Habit Detail** — a single habit's current Design (cue/floor/identity), stats, the
   **weekly-actual growth chart** (visible gradual growth), and journal history.
4. **Reflection** — per-habit, entered by tapping a habit's status light; diagnoses (with
   visible evidence), recommends, and updates the design (§6).

---

## 5. The Habit Loop — Stage Specifications

### Stage 1 — Design (write the hypothesis)

The first design is made with **zero data** — it is an inherently blind guess.
So the product treats it as a *v1 hypothesis to be corrected at reflection*, and
keeps creation light:

- **Measurement type — required.** Count/amount or **Yes/No**. A Yes/No habit has
  no amount to hit, so it skips the floor / unit / target fields (implicitly floor
  1, no target).
- **Floor — required for count habits.** Low-friction, can't-fail.
- **Cue (implementation intention) — optional at creation.**
- **Identity — optional at creation.**
- **Target — optional (count habits).**
- **Stat mapping** — habit rolls up into a real ability stat (Strength,
  Intelligence, Willpower, …), grounding the game layer in identity.

**Deliberate late introduction of cue/identity.** The thesis holds that a missing
cue is the #1 failure cause — yet we make cue *optional*. This is intentional: an
empty cue/identity becomes the **first diagnostic signal**. When a habit's
completion rate is low, reflection proposes *filling the cue/identity first*. A
cue adopted after the user has *felt* its absence ("ah, I had no trigger") works
far better than one forced at signup (experienced need > coerced input). The
cost — letting the user fail once before introducing the cue — is accepted on
purpose, and is cheaper than blank-form abandonment at creation.

### Stage 2 — Perform → Record (collect data)

- **Logging is one tap where you already are.** A count habit records an *actual*
  amount; a Yes/No habit logs a single "done." The highest-frequency action — "I did my
  minimum today" — is a **one-tap "+floor" (count) / "✓" (yes/no)** available on both the
  Today composer (§9) *and* the Dashboard row, with **smart defaults and quick-add chips**
  for other amounts, so logging almost never requires typing. Time is captured
  automatically (it only affects ordering) and tucked behind a reveal.
- **Log as you go (incremental).** A habit can be logged **multiple times in one day** —
  "2 glasses now, 3 more tonight" — instead of pre-summing in your head. The day's outcome
  is the **sum** of that day's entries, compared to the floor/target once at the day level
  (two `2` + `3` make a `5` day). A **live progress-to-floor** indicator ("3/5 · 2 to go")
  turns each log into visible movement. Each entry is independently editable and deletable;
  a skip logged earlier is overridden if real activity is logged later the same day.
- **Reward the moment, not just the dashboard.** Every log gives **immediate, attributed
  feedback** — "floor hit · +60 XP", "past target", a level-up, a milestone, or a
  **"showed up"** acknowledgment for a partial. A computed-but-undelivered reward is a dead
  reward; the reinforcing moment is the instant of the behavior.
- **Backfill (required), and easy.** Past-date entries can be added, so "did it but forgot
  to log" is recoverable and never a miss. A **"yesterday" fast-path** sits right in the
  Today composer for the dominant forgot-last-night case; older gaps use Habit Detail. This
  keeps the "blank is not a miss" bargain honest — forgotten days must be cheap to recover.
- **Skip with reason — a pre-classified diagnosis that now *acts*.** Marking a day skipped
  is **one tap on a reason chip** (a small fixed set, to stay low-friction). Reasons map
  onto the diagnostic components, and V1 now **feeds them into diagnosis** (SPEC §4.4
  Rule 5) rather than merely storing them — a repeated reason raises its component directly:
  - "missed the time / forgot" → **cue**
  - "too hard / too much" → **floor**
  - "sick / off / external" → **legitimate exception — excluded from miss count**
  - "didn't feel like it / no meaning" → **identity**
  - free-text note optional, alongside the category.
- **Heatmap.** Daily states visualized, each visually distinct: a *blank* (unknown) day
  must not look like a *partial* (logged-but-short) or a *skip* (miss) day.
- **never-miss-twice — a proactive save.** One miss is normal and recoverable; only
  *consecutive* misses are the real failure signal. The system intervenes **inside the open
  save window** — yesterday was a miss (or a streak just broke) and today is still blank —
  with an opportunity-framed nudge ("one floor log today keeps this rolling"), *before* the
  second miss completes, not after.

### Stage 3 — Reflect

See §6.

---

## 6. Reflection (the primary bet) — per-habit, active, V1 no LLM

Two structural changes from earlier drafts: reflection is **per-habit, not a
weekly batch**, and it is **active** (the system proposes; the user verifies).

### 6.1 Per-habit, status-light-driven
- No big weekly "review all habits" event (that becomes a chore → skipped → loop
  breaks). Instead, each habit carries a status light (§7) on the dashboard.
- The user reflects on **one habit at a time**, by tapping its light. Healthy
  (🟢) habits never enter the reflection queue.
- A weekly *rhythm* is still nudged (so reflection happens at all), but the *unit*
  is the individual habit.

### 6.2 Active form — verify, don't write
Reflection must be cheap. The user's job is **choosing, not writing**:
1. **Mirror** — resurface that habit's week: heatmap, missed days, journal notes.
2. **Diagnosis (pre-computed, rule-based).** The system states what it sees and
   asks only for confirmation: *"Looks like the Tue/Thu cue failed — [Right] /
   [No]."* Diagnosis runs over the four components (cue / floor / identity /
   load) using deterministic rules; no LLM in V1. Example rules:
   - floor-completion below threshold → *floor may be too high*
   - skips clustering on a weekday → *check that weekday's cue*
   - floor met but zero above-floor for N weeks → *stagnation / floor too low*
   - **cue/identity empty + low completion → propose filling them first** (§5)
   - **repeated skip-reason → its component** (several "forgot" skips → cue; several
     "too hard" → floor; several "no meaning" → identity) — the pre-classified skip
     now actively drives diagnosis, not just context (§5)
   - a low floor-rate needs a **minimum sample** before it flags — one honest partial
     day never trips a caution (honest logging is never punished vs. silence)
3. **Recommended action, pre-selected.** The fix is offered already checked:
   *"floor looks high → [Lower floor ✓]."* The user commits, or edits.
   Options: adjust cue / lower floor / raise target / fill cue·identity /
   pause / archive / **keep as-is**.
4. **Always show the reasoning.** Every diagnosis displays its evidence. This is
   the guardrail against users rubber-stamping a wrong recommendation — visible
   reasoning reduces uncritical agreement.

**The output of reflection is a change to (or explicit confirmation of) the habit
design.** That is where the loop closes in code.

---

## 7. Status Lights (always-on, dashboard)

Borrowed from the RPG pattern of badges/glows that route attention to where
action is available — adapted to avoid the ways that pattern fails.

### 7.1 States
- 🟢 **Stable** — no action needed; normally unlit. On a notable achievement it lights
  *positively* (⭐), and this reaches **both lifecycles** so the dashboard isn't only a
  nag: **Established** celebrates an *intensity* best (best weekly total); **Forming**
  celebrates a *consistency* best (best floor-completion week, or a new longest streak) —
  so the cohort that most needs encouragement gets it from day one.
- 🟡 **Caution** — one flag; "look when you have a moment." Queued, not urgent.
- 🔴 **Intervention opportunity** — consecutive miss (Forming) or a declining actual
  trend **that has fallen back toward the floor** (Established). Framed as *"a small fix
  gets this rolling again,"* never "you failed"; amber over aggressive red. A decline that
  merely settles from an unsustainable peak while still above target is **not** lit red —
  improving is never punished (§10).

### 7.2 Lifecycle changes the meaning of the same light
- **Forming 🔴** = floor consecutive miss → "wobbling, time to adjust the design."
- **Established 🔴** = actual trend declining **toward the floor** → "automatic, but
  growth has cooled." (A dip from a peak that stays above target is not red — §7.1/§10.)
Tapping either enters that habit's reflection (§6), but lands on a different view.

### 7.3 Aggregation — show the count
Rather than surfacing one shaky habit at a time, the dashboard **aggregates into a
number** (game-style "shaky habits · 3"). This is honest about total state and,
critically, **the count itself becomes a system-level signal** that feeds §8.

### 7.4 Anti-patterns to avoid (why game badges fail)
- **Badge inflation / alert blindness** — never light 🔴 for merely informational
  things; light only when a tap yields a ~30-second actionable decision.
- **Negative-signal weight** — game badges are rewards (new power!); ours risk
  reading as reproach. Mitigated by positive ⭐ lighting and "intervention
  opportunity" framing.

---

## 8. Habit Portfolio / System Load

The aggregate count from §7.3 powers a diagnosis our earlier drafts deferred to
V2: **too many habits at once.** This is the single most common design failure,
so the simplest, strongest version is pulled into V1. Two layers:

### 8.1 Prevention — soft cap on simultaneous *Forming* habits
At habit *creation*, if too many habits are already Forming, add friction (not a
hard block): *"3 habits are still settling. A slot opens when one becomes
Established — add anyway?"* This is more faithful to the thesis ("solve it at
design time") than after-the-fact correction, and intuitive as a game-style
"slot." Behavioral science backs "one habit at a time."

### 8.2 Correction — Focus Mode
If overload still accumulates, the dashboard proposes focus, **framed as
concentration, not quitting**: *"Focus on these 2 for now and **pause** the rest —
bring them back once these settle."* Pause is a real exit, **not deletion** — the
RPG equivalent of "do later," not "abandon quest." This sidesteps the
all-or-nothing churn trap that a blunt "reduce your habits" would trigger.

### 8.3 Threshold signal
The primary overload signal is the **number of habits simultaneously in
Forming**, not a raw 🔴 count (10 habits with 3 🔴 ≠ 4 habits with 3 🔴; and
Established habits carry near-zero load). Exact threshold/formula is open (§10).

---

## 9. Daily Log Layer (Today tab + free logging)

A logging layer alongside habits, on the **Today** surface.

### 9.1 Free logs
- **Purpose:** a simple record of the user's day — *not* part of habit scoring or
  reflection. Just "what happened today."
- **Types:** Note / Win / Mood / Idea.
- **Timestamp:** defaults to now and is **collapsed behind a small "🕑 지금 HH:MM"
  reveal** (SPEC §6.2, B3) — timestamp only affects ordering — with separate hour/minute
  pickers (10-minute increments) shown on tap for the rare override.
- **No XP, no stat/streak effect.** Free logs never touch the game layer.

### 9.2 Unified composer
- Habit entries and free logs are created from the **same** composer on Today.
- A target selector chooses "Free log" or one of the user's habits:
  - Free log → type (Note/Win/Mood/Idea) + optional note.
  - Habit (count) → actual amount (+ optional note); classified done/over, awarded XP.
  - Habit (yes/no) → a single "done" (+ optional note); awarded XP.

### 9.3 Today feed
- Single chronological feed interleaving the day's habit entries and free logs —
  the *daily* counterpart to reflection's mirror.

### 9.4 Decoupling decision
Free logs are deliberately **kept out of habit reflection** (an earlier
"auto-surface logs as context" idea was rejected). Consequences, both positive: a
clean low-pressure daily journal, and a habit-reflection input that stays
*habit-data only* — keeping the V2 LLM's input clean and validation simple (§10).
There is no log↔habit linking to design.

---

## 10. Progression / Reward System

**XP is the single progression currency.** A stat's level is a threshold lookup
over its cumulative XP, and the character level is the highest stat level. One
honest number: everything you do converts into XP, and XP is what levels you up.

XP is earned so that improving is never punished (no "max-performance-based XP,"
where requirements rise as you improve → negative reinforcement → churn):

- **Floor completion → base XP** — always attainable, both habit kinds. The
  consistency reward; streaks build on it.
- **Count habits, above the floor → more XP** — above-floor *actual* converts to
  XP (intensity), plus a bonus for exceeding the target. Doing more accelerates
  leveling without ever being *required*.
- **Yes/No habits → decaying streak-milestone XP** — having no above-floor
  intensity, a yes/no habit instead earns a bonus when its streak reaches a
  milestone (5, 10, 20, … days). Re-reaching the same milestone after the streak
  breaks awards a **diminishing** amount (geometric decay), so rebuilding still
  motivates but can't be farmed. A merely-blank gap is forgiven (the streak
  continues); only a logged miss resets it.
- **Streak milestones (count) → once-only bonus** at N-day marks.
- **Showing up (sub-floor) → a "showed up" streak, not XP** — a partial day (real
  activity below the floor) earns **no XP** (the floor stays *the* rewarded threshold, so
  nothing can be farmed by logging a tiny amount), but it advances a separate
  **engagement streak** ("showed up 7 days"). This makes *attempting* the habit strictly
  better than doing nothing — reinforcing the very repetitions that build automaticity in
  the Forming phase (Lally) — without diluting the floor or the XP economy.
- **Reward is delivered at the moment of the log**, not left as a number on a dashboard:
  each log shows what it just unlocked (floor hit, past target, level-up, milestone, or
  "showed up"). Immediate, attributed reinforcement is what installs the habit.

By lifecycle: **Forming** foregrounds floor / XP / streak / the "showed up" streak;
**Established** shifts to monitoring the *actual trend*, now **shown as a real
weekly-actual growth chart** (not merely an internal signal) — so a successfully automated
habit still has a reason to stay (visible growth tracking), dissolving the "succeed → app
becomes useless" tension. Cumulative XP keeps rising, but *growth* is read from the trend,
so the game layer can never visually mask a real decline.

> **Superseded design note 1:** the original "vary XP-bar size by days-to-level-up
> / max-performance-based XP" is **replaced** by the XP model above, because it
> penalized improvement.
>
> **Superseded design note 2:** an earlier split had **XP and stat level as two
> separate tracks** (XP from floor; level from cumulative above-floor actual). That
> left XP as a display-only number and gave yes/no habits — which have no
> above-floor amount — no way to level. **Unified:** cumulative XP now drives the
> level, and intensity/milestones feed XP, so both habit kinds progress through one
> currency.

---

## 11. Out of Scope for MVP (deferred to V2+)

### 11.1 LLM-based reflection (V2)
Deferred to keep the MVP focused and validatable. Design when built:
- **Diagnosis, not prescription.** Determines *which design component is broken*;
  does not prescribe. Prescription reintroduces over-ambition → churn risk.
- **Refines the V1 rule-based flags** on the *same* four components — more
  precise, same contract.
- **Constrained structured output, not free text:**
  ```
  flag_diagnosis({
    component: "cue" | "floor" | "identity" | "load",
    severity:  "ok" | "warning" | "critical",
    evidence:  [ ... ],   // cited only from provided data
    confidence: 0.0–1.0
  })
  ```
- **Code aggregates, LLM interprets.** Stats computed in code and passed in.
- **Habit-data-only input.** Free logs (§9) excluded — clean input, tractable
  validation.
- **No `recommendation` field.** Prescription handled by deterministic rules.
- **Guardrail "constitution"** in the system prompt: never-miss-twice, don't raise
  the floor casually, don't emphasize extrinsic reward.
- **Closed environment via strict schema + enums, not tool calling.**
- **Validation:** human-labeled golden set (50–100), track component accuracy /
  severity F1; benchmark against V1 rules. Reasoning model, dimension-parallel
  calls + final synthesis (mirrors the rubric-scoring service).
- **Richer multi-habit interaction.** V1 already ships the simplest cross-habit
  diagnosis (Forming-count overload, §8); deeper interaction analysis (e.g.
  competing cues, correlated declines) is the V2 extension.

### 11.2 Other deferred items
- Image attachments in journals/logs.

---

## 12. Open Questions

1. **Naming.** "Habiquest" leading but not finalized.
2. **Stat taxonomy & cardinality.** Stat list; Habit→Stat 1:N vs N:N (1:N is the
   leaning default for simpler XP attribution; not confirmed).
3. **Floor / level math.** XP curve and stat-level formula. *(Resolved in
   direction — see §10: XP is the single currency, level = cumulative-XP threshold
   lookup, yes/no uses decaying streak-milestone XP. Exact numbers stay
   placeholders in `config/tuning.ts`.)*
4. **Thresholds.** Concrete values for: status-light tiers (🟡/🔴), Forming→
   Established transition, and the Forming-count overload trigger (§8.3).
5. **Reflection trigger.** Weekly rhythm — fixed weekday vs. adaptive.
6. **Success metrics.** How "the loop closed" is measured (candidate north-star:
   4-week floor-retention; loop metrics: reflection-completion rate,
   post-reflection design-change rate, design-change → retention link). Undecided.
7. **Data model.** Entities (Habit, Stat, HabitEntry[facts-only: `actual` / optional
   `skipReason` — day-state is *computed*, not stored], FreeLog, ReflectionSession,
   lifecycle state) and relations. *(Largely resolved — see SPEC §3; day-states are
   derived per SPEC §4.1.)*

---

## 13. Design Principles (summary)

1. The loop must close. Records exist to update the design.
2. Game layer is a scaffold, not the product. Science wins conflicts — and it is
   rendered *quietly* (minimal, adaptive light+dark UI; §4 / SPEC §6.0), not a loud RPG skin.
3. The first design is a hypothesis — keep creation light (floor required for count
   habits; cue/identity introduced when the data shows they're needed).
4. Reward the floor (consistency) and growth above it (intensity) — unified as XP,
   the single currency that drives level.
5. never miss twice — one miss is recoverable, not a failure; intervene proactively
   inside the still-open save window, *before* the second miss completes.
6. Resurface records actively; an unread record is dead.
7. Reflection is per-habit, active (verify, don't write), and ends in a decision.
8. Keep the diagnosis input clean: only explicit skips count as misses; blank is
   unknown and partial (logged-but-short) is not a miss. Honest logging is never
   penalized vs. silence — scoped to XP, streak, and miss-count (partial deliberately
   lowers the floor-rate as a *help* signal, but never causes demotion), and the "showed
   up" streak makes an honest partial strictly *better* than silence. Explicit
   skip-reasons actively drive diagnosis; free logs stay out of reflection.
9. Status lights are intervention *opportunities*, not reproaches — and mix in
   positive lighting.
10. Overload is a design failure: prevent with Forming slots, correct with Focus
    Mode. Frame as concentration + pause, never "reduce/quit."
11. Don't evict success — an Established habit shifts to growth monitoring, it
    isn't graduated out of the app.
12. When the LLM arrives (V2): diagnose, don't prescribe; constrain, don't generate.