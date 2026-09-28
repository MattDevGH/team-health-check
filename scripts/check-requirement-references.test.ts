/**
 * Tests for the gate that checks every citation points somewhere real.
 *
 * Requirements: Traceability 1.1, 1.2, 1.3; Integration 10.9
 *
 * This ran on every pull request from the day it was written and nothing
 * checked it — 0% covered when coverage was first measured on 2026-09-26. The
 * rule it enforces lives in `reference-index.ts` and is well covered; what was
 * untested is everything around it: which files it looks at, which it skips,
 * and whether it actually fails.
 *
 * Driven against a temporary directory rather than the real specs, so a test
 * cannot start passing or failing because somebody edited a requirement.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadSpecs, sourceFiles, run } from './check-requirement-references';

let workDir = '';

/** Writes a file, creating the directories above it. */
function write(relative: string, contents: string): void {
  const full = path.join(workDir, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function specsDir(): string {
  return path.join(workDir, '.kiro/specs');
}

/** A minimal spec whose requirement 1.1 exists. */
const ORIGINAL_SPEC = `# Requirements

### Requirement 1: The First One

#### Acceptance Criteria

1. THE application SHALL do the thing.
2. THE application SHALL do the other thing.
`;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'thc-refs-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('which specs it reads', () => {
  it('loads every directory that has a requirements document', () => {
    write('.kiro/specs/team-health-check/requirements.md', ORIGINAL_SPEC);
    write('.kiro/specs/another-spec/requirements.md', ORIGINAL_SPEC);

    expect(loadSpecs(specsDir()).map(s => s.slug).sort()).toEqual([
      'another-spec',
      'team-health-check',
    ]);
  });

  /**
   * A spec in progress may have tasks and a design before it has
   * requirements. Refusing to start would make this something people turn off.
   */
  it('skips a spec that has no requirements document yet', () => {
    write('.kiro/specs/team-health-check/requirements.md', ORIGINAL_SPEC);
    write('.kiro/specs/just-started/tasks.md', '- [ ] 1. Think about it');

    expect(loadSpecs(specsDir()).map(s => s.slug)).toEqual(['team-health-check']);
  });

  it('ignores a loose file sitting beside the spec directories', () => {
    write('.kiro/specs/team-health-check/requirements.md', ORIGINAL_SPEC);
    write('.kiro/specs/README.md', 'not a spec');

    expect(loadSpecs(specsDir())).toHaveLength(1);
  });
});

describe('which files it looks at', () => {
  it('finds TypeScript anywhere below the directory', () => {
    write('src/a.ts', '');
    write('src/nested/deep/b.tsx', '');

    const found = [...sourceFiles(path.join(workDir, 'src'))].map(f =>
      f.split(path.sep).join('/').replace(workDir.split(path.sep).join('/') + '/', ''),
    );

    expect(found.sort()).toEqual(['src/a.ts', 'src/nested/deep/b.tsx']);
  });

  it.each(['README.md', 'styles.css', 'data.json', 'notes.txt'])('ignores %s', name => {
    write(`src/${name}`, '');

    expect([...sourceFiles(path.join(workDir, 'src'))]).toHaveLength(0);
  });

  /**
   * The generated Prisma client is thousands of files this project did not
   * write and cannot cite. Without these skips the check would be slow and
   * would report on code nobody here can fix.
   */
  it('does not descend into generated or node_modules', () => {
    write('src/real.ts', '');
    write('src/generated/prisma/client.ts', '');
    write('src/node_modules/thing/index.ts', '');

    expect([...sourceFiles(path.join(workDir, 'src'))]).toHaveLength(1);
  });
});

describe('what it reports', () => {
  function check(): { code: number; out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const code = run(specsDir(), [path.join(workDir, 'src')], {
      out: m => out.push(m),
      err: m => err.push(m),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  beforeEach(() => {
    write('.kiro/specs/team-health-check/requirements.md', ORIGINAL_SPEC);
  });

  it('passes when every citation resolves', () => {
    write('src/good.ts', '/** Requirements: 1.1 */\nexport const a = 1;\n');

    const result = check();

    expect(result.code).toBe(0);
    expect(result.out).toContain('Every reference resolves');
  });

  it('fails on a criterion the requirement does not have', () => {
    write('src/bad.ts', '/** Requirements: 1.9 */\nexport const a = 1;\n');

    const result = check();

    expect(result.code).toBe(1);
    expect(result.err).toContain('bad.ts');
  });

  it('fails on a spec that does not exist', () => {
    write('src/bad.ts', '/** Requirements: Imaginary Spec 1.1 */\nexport const a = 1;\n');

    expect(check().code).toBe(1);
  });

  it('names the file, so the failure can be acted on', () => {
    write('src/nested/culprit.ts', '/** Requirements: 1.9 */\n');

    expect(check().err).toContain('culprit.ts');
  });

  it('says how to name another spec, because that is the usual mistake', () => {
    write('src/bad.ts', '/** Requirements: 1.9 */\n');

    expect(check().err).toContain('Explaining Itself 1.4');
  });

  /**
   * This project's own checker tests are full of deliberately broken
   * references as data. Counting those would make the check impossible to
   * pass — so only comments are read.
   */
  it('ignores a citation inside a string, which is test data', () => {
    write('src/fixture.ts', "export const example = 'Requirements: 1.9';\n");

    const result = check();

    expect(result.code).toBe(0);
    expect(result.out).toContain('References checked:     0');
  });

  it.each([
    ['a line comment', '// Requirements: 1.1'],
    ['a block comment', '/* Requirements: 1.1 */'],
    ['a doc comment continuation', ' * Requirements: 1.1'],
  ])('reads a citation in %s', (_kind, line) => {
    write('src/cited.ts', `${line}\nexport const a = 1;\n`);

    expect(check().out).toContain('References checked:     1');
  });

  it('counts the files that cite something, not every file', () => {
    write('src/cited.ts', '/** Requirements: 1.1 */\n');
    write('src/silent.ts', 'export const a = 1;\n');

    expect(check().out).toContain('Files citing a requirement: 1');
  });

  it('passes when there is nothing to check at all', () => {
    // An empty tree is not a failure; it is a tree with no citations in it
    write('src/.keep', '');

    expect(check().code).toBe(0);
  });
});
