import { describe, it, expect } from 'vitest';

import { tallyTasks, buildStatusBlock, replaceBlock, START, END } from './generate-status';

describe('tallyTasks', () => {
  it('counts ticked and unticked boxes', () => {
    const markdown = ['- [x] one', '- [ ] two', '  - [x] nested', '  - [ ] nested open'].join('\n');

    expect(tallyTasks(markdown)).toEqual({ done: 2, total: 4 });
  });

  it('accepts an uppercase tick, because both are written by hand', () => {
    expect(tallyTasks('- [X] one')).toEqual({ done: 1, total: 1 });
  });

  it('ignores a checkbox mentioned mid-sentence', () => {
    // Prose about the notation is not the notation
    expect(tallyTasks('A box reads - [ ] until it is ticked.')).toEqual({ done: 0, total: 0 });
  });

  it('reports nothing for a spec with no boxes', () => {
    expect(tallyTasks('# Tasks\n\nNothing here yet.')).toEqual({ done: 0, total: 0 });
  });
});

describe('buildStatusBlock', () => {
  const tallies = [
    { name: 'alpha', done: 10, total: 10 },
    { name: 'beta', done: 8, total: 11 },
    { name: 'gamma', done: 5, total: 6 },
  ];

  it('totals every spec', () => {
    expect(buildStatusBlock(tallies)).toContain('**23 of 27 task boxes are ticked**, across 3 specs');
  });

  it('lists only the specs with open boxes', () => {
    const block = buildStatusBlock(tallies);

    expect(block).toContain('`beta` | 3 of 11');
    expect(block).toContain('`gamma` | 1 of 6');
    // A complete spec listed as a fraction invites arithmetic that teaches
    // nothing
    expect(block).not.toContain('`alpha`');
  });

  it('says so plainly when everything is closed', () => {
    const block = buildStatusBlock([{ name: 'alpha', done: 10, total: 10 }]);

    expect(block).toContain('Every spec is closed.');
    expect(block).not.toContain('| Spec | Open |');
  });

  it('says that an open box is not automatically work to do', () => {
    // Several are blocked on a domain purchase and a second Slack account, and
    // a bare count reads as neglect without that
    expect(buildStatusBlock(tallies)).toContain('not automatically work to do');
  });

  /**
   * The whole point. A branch name, a commit, a date or a test count changes on
   * commits that touch no spec, so --check would fail on unrelated work and be
   * switched off. Git answers all of those correctly already.
   */
  it('carries nothing that changes without a spec changing', () => {
    const block = buildStatusBlock(tallies);

    expect(block).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(block).not.toMatch(/\bbranch\b/i);
    expect(block).not.toMatch(/\bcommit\b/i);
  });

  it('is wrapped in the markers the replacer looks for', () => {
    const block = buildStatusBlock(tallies);

    expect(block.startsWith(START)).toBe(true);
    expect(block.endsWith(END)).toBe(true);
  });
});

describe('replaceBlock', () => {
  const document = ['# Title', '', START, 'stale contents', END, '', 'Prose below.'].join('\n');

  it('replaces what is between the markers and leaves the rest alone', () => {
    const updated = replaceBlock(document, [START, 'fresh', END].join('\n'));

    expect(updated).toContain('fresh');
    expect(updated).not.toContain('stale contents');
    expect(updated).toContain('# Title');
    expect(updated).toContain('Prose below.');
  });

  it('refuses a document with no markers rather than appending', () => {
    // Appending would silently produce two status blocks, which is the shape
    // the document-structure check exists to catch
    expect(() => replaceBlock('# Title\n\nNo markers.', 'x')).toThrow(/not found/);
  });

  it('refuses markers in the wrong order', () => {
    expect(() => replaceBlock([END, START].join('\n'), 'x')).toThrow(/not found/);
  });
});
