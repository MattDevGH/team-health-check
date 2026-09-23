/**
 * A document should not contain the same section twice.
 *
 * Requirements: Traceability 1.2
 *
 * Written after 602 duplicated lines shipped in the README — everything from
 * "## Architecture" to "## Spec", twice, through a green pipeline. The project's
 * front door grew by 65% and every gate passed, because the requirement-reference
 * checker reads citations and nothing else reads these files at all.
 *
 * The cause was a script slicing a file between two `indexOf` results, where the
 * second name also appeared earlier in the document: `slice(0, start) +
 * slice(end)` with `end < start` does not remove a region, it repeats one.
 * Silently.
 *
 * So this checks shape rather than prose. It cannot tell whether a paragraph is
 * true — only that the same section is not there twice, which is the shape that
 * particular accident takes.
 */

import { describe, it, expect } from 'vitest';

import { findStructuralProblems } from './check-doc-structure';

describe('a document with distinct sections', () => {
  it('reports nothing', () => {
    const doc = ['# Title', '', '## One', 'text', '', '## Two', 'more'].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });

  it('allows the same wording at different levels', () => {
    // "## Testing" and "### Testing" under it are a section and its subsection,
    // not a repetition
    const doc = ['## Testing', '', '### Testing', 'text'].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });
});

describe('a section that appears twice', () => {
  it('is reported, with the lines it appears on', () => {
    const doc = ['## Architecture', 'a', '', '## Spec', 'b', '', '## Architecture', 'c'].join(
      '\n',
    );

    const problems = findStructuralProblems(doc);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ heading: '## Architecture', lines: [1, 7] });
  });

  it('names every repeat, not merely the first', () => {
    /*
     * The real case had one heading three times over. Reporting a single pair
     * would send somebody to fix half of it and declare the file clean.
     */
    const doc = ['## Same', '', '## Other', '', '## Same', '', '## Same'].join('\n');

    expect(findStructuralProblems(doc)[0].lines).toEqual([1, 5, 7]);
  });

  it('catches a whole run of repeated sections as separate problems', () => {
    const doc = ['## A', '', '## B', '', '## A', '', '## B'].join('\n');

    expect(findStructuralProblems(doc).map(p => p.heading)).toEqual(['## A', '## B']);
  });
});

describe('subsections', () => {
  it('may repeat under different parents', () => {
    /*
     * Deliberately allowed. "### 1. Create" under two different setup guides is
     * ordinary writing, and forbidding it would make the check something people
     * work around rather than fix.
     */
    const doc = ['## Slack', '', '### Setup', '', '## Email', '', '### Setup'].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });

  it('may not repeat under the same parent', () => {
    const doc = ['## Slack', '', '### Setup', 'a', '', '### Setup', 'b'].join('\n');

    expect(findStructuralProblems(doc)).toHaveLength(1);
  });
});

describe('what is not a heading', () => {
  it('ignores headings inside a fenced code block', () => {
    /*
     * Shell comments start with `#`, and this README is full of fenced examples
     * that contain them. Counting those would make the check fire on documents
     * that are perfectly well formed — and a check that cries wolf gets
     * disabled.
     */
    const doc = [
      '## Commands',
      '',
      '```bash',
      '## not a heading',
      '## not a heading',
      '```',
      '',
      '## Other',
    ].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });

  it('ignores a fence opened with more than three backticks', () => {
    const doc = ['## A', '', '````', '## x', '## x', '````', '', '## B'].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });

  it('ignores a line that merely starts with a hash', () => {
    // `#Heading` with no space is not a heading, and neither is a bare `#`
    const doc = ['## A', '', '##NotAHeading', '##NotAHeading', '', '## B'].join('\n');

    expect(findStructuralProblems(doc)).toEqual([]);
  });

  it('treats trailing whitespace as the same heading', () => {
    // Otherwise a copy-paste that gained a trailing space would slip through
    const doc = ['## A  ', '', '## B', '', '## A'].join('\n');

    expect(findStructuralProblems(doc)).toHaveLength(1);
  });
});

describe('the documents this repository actually ships', () => {
  it('names the file a problem is in', async () => {
    // A report without a filename sends a reader to grep for it
    const { checkFiles } = await import('./check-doc-structure');

    const results = checkFiles([{ path: 'a.md', content: '## X\n\n## X' }]);

    expect(results[0]).toMatchObject({ path: 'a.md' });
    expect(results[0].problems).toHaveLength(1);
  });

  it('reports a clean set as clean', async () => {
    const { checkFiles } = await import('./check-doc-structure');

    expect(checkFiles([{ path: 'a.md', content: '## X\n\n## Y' }])).toEqual([]);
  });
});
