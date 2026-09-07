---
name: prototype-fidelity
description: Build Grains UI so it matches the design prototype instead of drifting from it. Use this skill whenever you are about to create or change anything a person will look at in this repo — a page, a route, a component, a layout, a colour, a chip, a table, an empty state — and also when reviewing UI someone else wrote, porting a screen, or investigating why an implemented page looks different from the design. The visual contract lives in docs/design-system/component-library.html and docs/design/grains-prototype.html, and the prototype is an exported artifact that greps as noise, so it is easy to skip by accident. Skipping it is exactly how the lab detail page ended up with the wrong layout, the wrong palette and invented components. Reach for this before writing markup, not after.
---

# Matching the prototype

Grains has a complete visual specification. It is easy to miss, and missing it
costs a rebuild — the lab detail page was implemented from the wireframe and the
PRDs, shipped, reviewed, and then rewritten from scratch because it looked
nothing like the design.

The failure was never a lack of care. It was that the spec did not open.

## Where the design actually lives

| File | What it is | How to read it |
| --- | --- | --- |
| `docs/design-system/component-library.html` | **Start here.** Every token, every component, the state attributes, the layout frame, the do/don't list. Transcribed from the prototype so it *can* be read. | Plain HTML, ~43 KB. Just read it. |
| `docs/design/grains-prototype.html` | The 11-screen clickable prototype. The final word on how a specific screen is laid out. | Exported artifact, ~780 KB. **Unreadable without `scripts/extract_prototype.py`.** |
| `docs/design/grains-wireframe.html` | Structure and edge cases: which sections exist, what the empty states say, which flows connect. | Readable, but it is *structure*, not appearance. |

The distinction that matters: **the wireframe tells you what sections a page
has; the prototype tells you what they look like.** Building from the wireframe
alone gives you the right content in the wrong clothes, which is a rebuild, not
a polish pass.

## The workflow

### 1. Read the component library first

It is cheap and it answers most questions. Look for the component you are about
to build — Buttons, Filter chips, Status pill, Badge, Service checklist, Lab
card, Map pin, Inputs, Toast, Empty state, Edit-history diff row — plus the
"Foundations", "State-driven attributes" and "Layout & responsive frame"
sections.

If it names your component, you have the spec. You may not need the prototype at
all.

### 2. Pull the actual screen out of the prototype

For anything page-shaped, the library is not enough — you need the layout.

```bash
python3 .claude/skills/prototype-fidelity/scripts/extract_prototype.py --screens
python3 .claude/skills/prototype-fidelity/scripts/extract_prototype.py --tokens
python3 .claude/skills/prototype-fidelity/scripts/extract_prototype.py \
  --find "PRICING PER PROCESS" --before 400 --after 8000
```

Search by text you can see on the screen — a section heading works well. The
markup that comes back carries inline styles with exact values: flex ratios,
paddings, font stacks, border widths. Read those rather than approximating from
a screenshot; a screenshot cannot tell you `flex:1 1 480px`.

To see it rather than read it, write the readable copy and open it:

```bash
python3 .claude/skills/prototype-fidelity/scripts/extract_prototype.py
# → .prototype-cache/prototype.html, openable in the browser pane
```

### 3. Reconcile the tokens before writing any colour

This is where the drift started, and it is worth one explicit check.

`app/globals.css` was written from the *prose* in CLAUDE.md ("warm fine-art
paper, e.g. `#F9F8F6`"). The design system uses different values. They have never
been formally reconciled, which means:

- **Do not read a hex value out of the prototype and paste it into a component.**
  Map it onto the existing semantic token instead — `--paper` → `--background`,
  `--ink` → `--foreground`, `--ash` → `--muted-foreground`, `--faint` → `--ring`,
  `--hair` → `--border`, `--signal` → `--destructive`, `--sunk` → `--secondary`.
- **The palette is a foundation decision (P7) and is not a track's to move.** If
  the difference actually matters for what you are building, raise it rather than
  changing `globals.css` from a feature branch.
- **Genuinely new vocabulary is different from palette.** The per-process colours
  (`c41` amber, `ecn2` teal, `e6` blue, `bw` ink) are data identity, not theme.
  They belong in a component-scoped stylesheet — see
  `components/labs/lab-detail.css` for the pattern, which follows
  `components/map/lab-map.css`.

### 4. Prefer the prototype's state attributes to conditional class strings

The prototype expresses state as data attributes with CSS behind them —
`data-process`, `data-status`, `data-endorsed`, `data-zero`, `data-svstate`,
`data-filled`, `data-stripe`. Keep that shape. It is not a style preference: the
attribute names are the vocabulary the design and the code share, so a reviewer
can grep `data-endorsed` and find both halves. Ternaries that assemble Tailwind
strings bury the state machine in the markup.

### 5. Diff it side by side before you call it done

Not "does it work". **Does it match.** Open both at the same viewport width and
compare:

```bash
# implementation
pnpm dev -p 3001
# prototype
python3 .claude/skills/prototype-fidelity/scripts/extract_prototype.py
```

Walk this list. Each line is something that was actually wrong the first time:

- **Page frame** — full-bleed or centred? The lab page is edge-to-edge with a
  bordered rail, not a `max-w-5xl` column.
- **Column split and wrap** — the prototype writes real ratios
  (`flex:1 1 480px` / `flex:1 1 300px`). Match them; do not guess a grid.
- **Order of blocks** — photos above the title, not below it.
- **Heading row** — what sits *beside* the title rather than under it.
- **Every roster is complete** — un-offered processes, un-ticked services and
  zero-count badges all keep their slot. This is a product rule, not a visual
  one: an absent row says nothing, an empty one invites a contribution.
- **Button weights** — one filled primary, everything else outlined, exactly one
  signal-coloured action per screen.
- **Type scale** — the prototype's sizes are small and specific (10px tracked-out
  eyebrows, 12px body, 32px serif titles). Tailwind's defaults are not these.
- **Empty and unknown states** — the prototype draws them; it does not hide them.

### 6. Record deviations instead of inventing a third thing

Sometimes the prototype and the schema genuinely disagree. The prototype's
pricing table has one TURNAROUND column per process; the schema stores
turnaround per `(process, format)`.

The wrong move — and the one made the first time — is to quietly invent a third
layout that matches neither. Instead:

1. Match the prototype's layout.
2. Handle the data honestly inside it. (Here: show one value when the formats
   agree, and both labelled when they differ. Never flatten them into a span that
   implies a 135 might take a week.)
3. Write the tension down in a comment where the component is, and in the build
   plan's decision table if it needs a decision.

A deviation somebody can find is fine. A silent one is what causes the rebuild.

## Why this keeps happening

Worth understanding, because the pull is real:

- The prototype does not open. `grep` on it returns escaped noise, so the natural
  move is to fall back to a document that *does* open — the wireframe — and the
  wireframe is convincing enough that you do not notice what is missing.
- Nothing in `CLAUDE.md` names either design file as the visual contract. The
  design section there is prose, and is headed "not yet implemented", which reads
  as aspirational rather than binding.
- Verification naturally asks "does this render, do the states work, do the tests
  pass" — all of which can be true of a page that looks nothing like the design.

None of that is fixed by trying harder. It is fixed by opening the component
library first and by diffing at the end.

## Scope note

`app/globals.css`, `app/layout.tsx` and `components/layout/**` are shared
foundation rather than any one track's files. Site chrome — the nav, the TH/EN
toggle — is Phase 3 (P22), not something to add while building a page. Check the
file-ownership table in `CLAUDE.md` before editing outside your track.
