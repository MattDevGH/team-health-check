# Design Document

## Overview

A checker, a convention, and two corrections. The checker is small; the
convention is what makes it possible; the corrections are the backlog it found.

## Key Decisions

### 1. A bare number means the original spec

The alternative was requiring every citation to name its spec, which would mean
rewriting 654 of them in files nobody is otherwise touching — a large diff with
a real chance of attributing something wrongly, to fix an ambiguity that has
misled exactly one reader so far.

Naming the existing convention costs nothing and makes the rest checkable.
`Original` and `Integration` are kept as aliases because they predate this and
appear in too many files to be worth churning.

### 2. The check reads comments only

This checker's own tests contain deliberately broken references as fixtures. A
checker that counted them could never pass, and one that special-cased its own
test file would be a rule with an exception nobody could see.

Citations live in doc comments. A `Requirements:` string in code is data.

### 3. Criteria are counted, not just requirements

The failure that actually happened was `10.6` against a requirement with five
criteria — a reference that names a real requirement and a criterion that does
not exist. Checking only that Requirement 10 exists would have passed it.

### 4. What the check cannot catch, and saying so

A citation that resolves can still be wrong. `10.2` in the test-mode files
resolves against the original spec's *Response Data Integrity*, which has
nothing to do with capturing magic-link tokens — it was only visible because the
neighbouring `10.6` broke.

No parser can see that. It is the argument for Requirement 4 — open the
requirement, read it, then write the code — and the reason this spec includes a
rule for people as well as a script.

### 5. Task lists are reconciled by verification, not by ticking

`deployment` shows 0 of 62 while running in production, and the temptation is to
tick the lot. The 2026-08-23 closure audit found the opposite failure — tasks
marked complete before the behaviour existed — and cost days of re-verification.

So each box is checked against the code or a test that exercises it, and
anything that cannot be confirmed stays unticked with a note.

## Correctness Properties

1. **A citation that resolves names a criterion that exists.** Not merely a
   requirement.
2. **The check never passes vacuously.** It reports how many citations it
   verified; zero is a failure of the check, not a clean bill of health.
3. **A correction leaves a trace.** A requirement whose text is fixed says what
   it replaced.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Parsing a citation into spec, requirement, criterion | Unit | A decision table over strings |
| Counting criteria under a heading | Unit | Same, over a document |
| Whether the real tree passes | The script itself, in CI | The only place the real files are |

The parser is tested against the forms the codebase actually uses — bare,
qualified, `NFR`, semicolon-separated, and aliased — rather than the forms a
grammar would suggest, because the citations were written by hand over months.

## Out Of Scope

- **Rewriting the 654 bare citations.** The convention makes them correct as
  they stand.
- **Checking that a citation is *apt*** — that the requirement it names is the
  one the code serves. No parser can. Requirement 4 is the answer.
- **Citations in Markdown.** The specs cross-reference each other informally and
  a broken link there costs a reader a minute, not a misunderstanding.
