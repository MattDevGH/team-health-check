/**
 * Checks that every requirement reference in the source points at a real one.
 *
 * Requirements: Traceability 1.1, 1.2, 1.3
 *
 *   npx tsx scripts/check-requirement-references.ts
 *
 * Files here cite the requirement they serve. A citation nobody can follow is
 * worse than none, because it reads as though somebody checked — and one to a
 * requirement that had never existed got as far as a pull request description
 * before a human noticed.
 *
 * A bare number means the original spec. Anything else has to name its spec,
 * which is the whole point: `10.6` is a broken reference to the original and a
 * correct one to integration-hardening, and only the citation can say which.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  buildIndex,
  describeProblem,
  parseReferences,
  resolve,
  type SpecDocument,
} from '../src/lib/requirements/reference-index';

const SPECS_DIR = '.kiro/specs';
const SOURCE_DIRS = ['src', 'e2e', 'scripts'];

/**
 * Every spec that has a requirements document.
 *
 * Requirements: Traceability 1.1
 *
 * A directory without one is skipped rather than failing the run: a spec in
 * progress may have tasks and a design before it has requirements, and
 * refusing to start would make the check something people turn off.
 */
export function loadSpecs(specsDir: string = SPECS_DIR): SpecDocument[] {
  return readdirSync(specsDir)
    .filter(entry => statSync(path.join(specsDir, entry)).isDirectory())
    .map(slug => ({ slug, file: path.join(specsDir, slug, 'requirements.md') }))
    .filter(({ file }) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .map(({ slug, file }) => ({ slug, text: readFileSync(file, 'utf8') }));
}

/**
 * Every TypeScript file under a directory, recursively.
 *
 * Requirements: Traceability 1.1
 *
 * `generated` is skipped because the Prisma client is thousands of files this
 * project did not write and cannot cite; `node_modules` for the same reason at
 * a larger scale. Without those two the check would be slow and would report
 * on code nobody here can fix.
 */
export function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'generated') continue;
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

/** Where the check writes. Replaced in tests so nothing is spawned. */
export interface CheckOutput {
  out(message: string): void;
  err(message: string): void;
}

/**
 * The check exactly as CI runs it, returning the exit code.
 *
 * Requirements: Traceability 1.1, 1.2, 1.3
 *
 * Returning the code rather than setting `process.exitCode` is what lets a
 * test drive the whole thing in process. This gate had no tests at all until
 * 2026-09-27 — it runs on every pull request and nothing checked it, which is
 * the same gap the suite-integrity reporter had.
 */
export function run(
  specsDir: string = SPECS_DIR,
  sourceDirs: string[] = SOURCE_DIRS,
  output: CheckOutput = { out: console.log, err: console.error },
): number {
  const specs = loadSpecs(specsDir);
  const index = buildIndex(specs);

  const problems: string[] = [];
  let references = 0;
  let files = 0;

  for (const dir of sourceDirs) {
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(file, 'utf8');
      let cited = false;

      for (const line of text.split(/\r?\n/)) {
        if (!/Requirements?:/i.test(line)) continue;

        /*
         * Comments only. A citation lives in a doc comment; a string that
         * happens to read like one is test data — this checker's own tests are
         * full of deliberately broken references, and counting those would make
         * the check impossible to pass.
         */
        if (!/^\s*(\*|\/\/|\/\*)/.test(line)) continue;

        for (const reference of parseReferences(line)) {
          references += 1;
          cited = true;

          const problem = resolve(index, reference);
          if (problem) problems.push(describeProblem(problem, file.replace(/\\/g, '/')));
        }
      }

      if (cited) files += 1;
    }
  }

  output.out(`Specs indexed:          ${specs.length}`);
  output.out(`Files citing a requirement: ${files}`);
  output.out(`References checked:     ${references}`);

  if (problems.length === 0) {
    output.out('\nEvery reference resolves.');
    return 0;
  }

  output.err(`\n${problems.length} reference(s) do not resolve:\n`);
  for (const problem of problems) output.err(`  ${problem}`);
  output.err(
    '\nA bare number means the original spec. If the reference belongs to another,' +
      '\nname it: "Explaining Itself 1.4", "Integration 10.6".',
  );

  return 1;
}

if (process.argv[1]?.endsWith('check-requirement-references.ts')) {
  process.exitCode = run();
}
