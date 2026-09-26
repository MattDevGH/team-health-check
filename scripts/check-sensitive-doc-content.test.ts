import { describe, it, expect } from 'vitest';

import { findSensitiveContent } from './check-sensitive-doc-content';

/** The shapes this exists to refuse, as they actually appeared. */
describe('what it refuses', () => {
  it('finds a database identifier', () => {
    const found = findSensitiveContent('- Team: `cmt4sfyxs0001fc0f3v6uecya` — Browser Validated Team');

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('record identifier');
  });

  it('finds recorded scores', () => {
    const found = findSensitiveContent('closed/materialised with scores `4/5/3/3/4`');

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('recorded scores');
  });

  it('finds a recorded trend distribution', () => {
    const found = findSensitiveContent('subjective trends `improving/none/none/none/stable`');

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('recorded trend indicators');
  });

  it('reports the line it found each one on', () => {
    const found = findSensitiveContent('clean\nclean\n- `cmt4sfyxs0001fc0f3v6uecya`\n');

    expect(found[0]?.line).toBe(3);
  });

  it('finds every occurrence rather than stopping at the first', () => {
    const found = findSensitiveContent(
      '`cmt4sfyxs0001fc0f3v6uecya`\nscores `4/5/3/3/4`\ntrends `improving/none/none/none/stable`',
    );

    expect(found.map(f => f.kind).sort()).toEqual([
      'record identifier',
      'recorded scores',
      'recorded trend indicators',
    ]);
  });
});

/**
 * The reason this is narrow rather than a general "score-shaped text" check.
 * Specs, tests and prose legitimately talk about scores, ranges and the three
 * trend values, and a check that fires on those would be turned off within a
 * week — or worse, would push people into awkward wording to appease it.
 */
describe('what it leaves alone', () => {
  it.each([
    'THE Web_Interface SHALL render each Question with a Score input (1 to 5)',
    'a Score between 1 and 5 inclusive',
    'returns counts of improving/stable/declining per question',
    'trendIndicator: improving, stable, declining',
    'The dashboard shows 3.5 for Delivering Value',
    'scores 1-5 and an optional trend',
    'Calculated movement is up/down/flat/up/down',
    'commit ad79f827 reverted the bump',
    'the run id was 36135921486',
  ])('accepts: %s', line => {
    expect(findSensitiveContent(line)).toHaveLength(0);
  });

  it('accepts the three canonical trend values listed together', () => {
    // Three is the enumeration; a recording of one session has five
    expect(findSensitiveContent('improving/stable/declining')).toHaveLength(0);
  });

  it('accepts a version or a date that happens to contain digits and slashes', () => {
    expect(findSensitiveContent('released 2026/09/25, version 4.29.1')).toHaveLength(0);
  });

  it('ignores content inside a fenced code block', () => {
    // Fixtures and examples live in fences, and a fence is where a fake id
    // belongs if one is ever needed
    const text = ['before', '```ts', "const id = 'cmt4sfyxs0001fc0f3v6uecya';", '```', 'after'].join(
      '\n',
    );

    expect(findSensitiveContent(text)).toHaveLength(0);
  });
});
