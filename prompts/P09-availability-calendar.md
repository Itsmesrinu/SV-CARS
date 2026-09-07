# P09 — Fleet Availability Calendar  ·  WAVE 1  ·  **PARALLEL** (runs alongside P01–P05)

You are building the owner's operational picture: one screen showing every car in the fleet against every day of a month, where he blocks out the dates each car is away. This is the admin half of PLAN.md Amendment 2 — the half that makes "available from the 8th" appear on the customer's screen.

> **Numbered out of order on purpose.** P09 was added by Amendment 2 after P01–P08 were already written; renumbering would have broken every cross-reference in them. It is a **Wave 1** session — it starts with P01–P05, not after them.

**First:** read `prompts/CONTRACT.md` §16 end to end — **§16.1 (the five date rules), §16.2 (two independent concepts), §16.3 (status wording) and §16.7 (this screen)** are your specification. Then read `prompts/PLAN.md` Amendment 2, `docs/admin-rules.md` and `docs/design-system.md`. Then read `src/lib/availability.ts` (P00, read-only — it already has every date function you need).

**You own:**

```
src/pages/AdminAvailabilityPage.tsx      (replaces P00's stub entirely)
src/components/admin/availability/**     the grid and its parts
```

**You must not touch:** `src/App.tsx` (P00 already registered `/admin/availability` behind the `RequireAdmin` guard — you do **not** need to add routing), `src/pages/AdminPage.tsx` or any other file directly under `src/components/admin/` (P04 owns those, and it is adding the header link to your page), `src/lib/**`, `src/hooks/**`, `server/**`, `db/**`, `package.json`.

**Coding against unfinished work.** P01 is writing the availability endpoints and P03 the hooks, right now, in other sessions. Import them by their frozen contract signatures — `useFleetAvailability`, `useAddBlock`, `useUpdateBlock`, `useDeleteBlock` from `src/hooks`, and the helpers from `src/lib/availability.ts`. Your imports will not resolve until they land; that is expected. Judge `tsc` only on errors originating in your own files.

---

## What the owner is actually doing

He has eight cars. On a Tuesday morning a customer asks for the Innova next week. He needs to answer in five seconds, from a phone, standing next to the car. That is the whole design brief:

- **See** which cars are free on which days, across the fleet, without opening each car in turn.
- **Block** a range in one gesture when he hands a car over.
- **Free** a range when a booking falls through.

Everything else is decoration. If a choice is between prettier and faster-to-read-on-a-phone, pick faster.

## Task 1 — `src/pages/AdminAvailabilityPage.tsx`

The page shell. It sits outside `CustomerLayout` (P00 wired that) and inside the admin session guard.

- **Reuse the admin chrome.** `AdminPage.tsx` has a mobile top bar and a header block, and `AdminSidebar` is the fleet's navigation. Compose from the same class strings so this screen looks like it belongs. **Read those files; do not edit them** — P04 owns them and is rewriting them in parallel.
- A month header: `‹ September 2026 ›` with prev/next controls and a **Today** button that jumps back to the current month. Keep the month in the URL as `?month=2026-09` so a reload or a shared link lands on the same view.
- One `useFleetAvailability(from, to)` call for the whole visible month. **One request for the entire grid** — not one per car. If you find yourself calling a hook inside a row component, stop and lift it.
- Loading: a skeleton grid of the right dimensions, so nothing jumps when data arrives. Error: a retry affordance, never a blank screen.
- Empty fleet (no cars yet): a line pointing at the dashboard's "+ Add Car". No fake rows.

## Task 2 — The grid (`src/components/admin/availability/FleetCalendar.tsx`)

Cars down the left, days across the top, one cell per car-day.

**Layout**

- The car-name column is **sticky** on the left and the date header is **sticky** on top; the grid scrolls horizontally under both. On a phone, a 31-column grid cannot fit — horizontal scroll with a pinned name column is the honest solution, and the codebase already uses `overflow-x-auto no-scrollbar` and `md:sticky md:top-20` patterns you can copy.
- Weekends get a subtly different column background, and **today's column gets a visible marker**. Both from existing tokens (`bg-surface-container-low`, `border-primary`) — no new colours.
- Each row starts with the car's name and its **derived status for today** via `availabilityLabel(carAvailability(car))`, using the same badge classes as the fleet cards. The owner should be able to read "what is out right now" straight down the left edge.

**Cell states**

| State | Meaning |
| --- | --- |
| free | No block covers this day |
| blocked | A block covers this day — shaded, with the block's note as a `title` if it has one |
| past | Before today — visibly dimmed and **not editable**; history stays readable but you cannot rewrite last week by mis-dragging |
| master-off | The car's `availability` boolean is off — shade the **whole row** distinctly and label it. §16.2: this is "off the road indefinitely", not a dated block, and it must not look like one |

**Interaction**

- **Click-drag across a row** to select a range, release to create the block. Show the pending selection while dragging and the resulting dates (`05 Sep → 08 Sep`) in a small label so the owner sees what he is about to commit.
- **Click an existing block** to open the editor (Task 3).
- Mouse *and* touch. `onPointerDown` / `onPointerMove` / `onPointerUp` covers both with one code path; `touch-action: none` on the grid stops the page scrolling mid-drag. Test on a real phone viewport — this is the interaction most likely to be broken on the device the owner actually uses.
- Provide a keyboard/no-drag path too: an **"+ Block dates"** button per row opening the same editor with the dates typed in. Drag is the fast path, not the only path.

**The exclusive-end rule bites hardest here.** The owner drags across the 5th, 6th and 7th; that is a block of `startDate: '05', endDate: '08'`. Rendering it back must shade exactly those three cells, not four. Convert once, in one place, and write the conversion down in a comment: *the cell for day D is blocked when `D >= startDate && D < endDate`*. Get this wrong and every block in the app is off by a day (CONTRACT.md §16.1 rule 2).

## Task 3 — The block editor (`src/components/admin/availability/BlockEditor.tsx`)

A small dialog composed from `CarFormDialog`'s shell styling (read it; don't edit it).

- Fields: **"Out from"** and **"Back on"** as native `<input type="date">`, plus an optional **Note** (e.g. *"Ravi — Hyderabad trip"*).
- **The labels matter.** "Out from" and "Back on" are precisely what the exclusive end means, so the owner never has to think about inclusive-versus-exclusive. Do not label them "Start" and "End".
- Show the resulting duration live: *"3 days out, back on Tue 08 Sep"*.
- **The note is private.** State that under the field: it is never shown to customers. P01 keeps it out of the public payload; you keep the owner informed that it is his own.
- Delete, behind a confirm, for an existing block. Deleting frees the car — no cascade, no guard needed.
- **Handle the `409 conflict`** from an overlapping block: show *"Already blocked 05–08 Sep"* inline against the field, not as a generic toast. The owner's next action is to adjust the dates, so the message belongs where his eyes are. Remember adjacency is legal: `05→08` followed by `08→12` is two back-to-back rentals and must be accepted.
- Optimistic update with rollback on failure, and a visible pending state. An availability change that silently doesn't save is the worst bug this screen can have — the owner would tell a customer a car is free when it isn't.

## Task 4 — Keep it honest

- **Never invent a block.** No demo data, no "example booking", no pre-filled dates. An invented block takes a real car off the owner's website. `.github/copilot-instructions.md` forbids inventing business details and this is the most damaging place to do it.
- **Never compute availability yourself.** `carAvailability`, `isBlocked`, `nextFreeDate`, `rangesOverlap` and `formatDate` all exist in `src/lib/availability.ts`. P05 is rendering the same states on the customer side from those same functions; a second implementation here is how admin and public end up disagreeing about whether a car is free.
- **No new dependency.** No calendar library, no date library, no drag library. P00 installed none and the lockfile is shared with five other sessions right now.
- **No new visual styles.** `docs/design-system.md` still applies to a screen the customer never sees, because the owner has to recognise it as the same product.

---

## Verify your slice

The API may not exist yet (P01 is mid-flight) and the hooks may not either. Sequence: build the grid against a hand-made fixture array of `AvailabilityBlockDTO`, then swap in the hook when P03 lands.

Then, once `npm run dev:all` works:

1. Block 05→08 Sep on one car → **exactly three cells shade** (5th, 6th, 7th), and the 8th stays free.
2. Reload → the block is still there, in the same cells.
3. Add an adjacent block 08→12 → accepted, no `409`.
4. Add an overlapping block 06→10 → `409`, message inline, nothing saved.
5. Try to drag across past days → nothing happens.
6. Turn a car's master switch off in the dashboard → its whole row reads as indefinitely unavailable, distinct from a dated block.
7. On a 375px viewport: the name column stays pinned, the grid scrolls sideways, and a drag does not scroll the page.
8. Block a car's dates here, then open `/all-cars` → that card reads `Available from <date>`. **This is the acceptance test that matters** — it proves the owner's calendar reaches the customer.
9. Set the machine's timezone to something far from IST → today's column is still today in India.

If P01/P03 haven't landed when you finish, say so plainly and hand runtime verification to P06 — **do not claim you tested flows you couldn't run.**

## Acceptance

1. One request per month for the whole fleet; no per-car fetching.
2. Blocked cells match the stored ranges exactly under the exclusive-end rule — verified against a real row in `db:studio`, not by eye.
3. Create, edit and delete all persist and survive a reload.
4. Overlap returns an inline `409` message; adjacency is accepted.
5. Past days are not editable.
6. The master switch renders distinctly from a dated block.
7. Usable on a 375px viewport with touch.
8. No invented data, no new dependency, no new colours, no edits outside your ownership list.

## Commit

`git add src/pages/AdminAvailabilityPage.tsx src/components/admin/availability && git commit -m "feat(admin): fleet-wide availability calendar with drag-to-block"`

Never `git add -A` — five other sessions have work in progress in this tree.

## Report back

What you built, how you handled the inclusive/exclusive date boundary (state the rule you implemented, so P06 and P07 can check it in one read), how drag behaves on touch, which verification steps you actually ran versus deferred, and any mismatch you hit against P01's or P03's exports.
