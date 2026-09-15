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

function loadSpecs(): SpecDocument[] {
  return readdirSync(SPECS_DIR)
    .filter(entry => statSync(path.join(SPECS_DIR, entry)).isDirectory())
    .map(slug => ({ slug, file: path.join(SPECS_DIR, slug, 'requirements.md') }))
    .filter(({ file }) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .map(({ slug, file }) => ({ slug, text: readFileSync(file, 'utf8') }));
}

function* sourceFiles(dir: string): Generator<string> {
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

function main(): void {
  const specs = loadSpecs();
  const index = buildIndex(specs);

  const problems: string[] = [];
  let references = 0;
  let files = 0;

  for (const dir of SOURCE_DIRS) {
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

  console.log(`Specs indexed:          ${specs.length}`);
  console.log(`Files citing a requirement: ${files}`);
  console.log(`References checked:     ${references}`);

  if (problems.length === 0) {
    console.log('\nEvery reference resolves.');
    return;
  }

  console.error(`\n${problems.length} reference(s) do not resolve:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nA bare number means the original spec. If the reference belongs to another,' +
      '\nname it: "Explaining Itself 1.4", "Integration 10.6".',
  );

  process.exitCode = 1;
}

main();
