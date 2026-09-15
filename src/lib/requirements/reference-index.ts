/**
 * Resolving a requirement reference to a requirement that exists.
 *
 * Requirements: Traceability 1.1, 1.2, 1.3
 *
 * Source files here cite the requirement they serve — 462 of them at the time
 * this was written. A citation nobody can follow is worse than none, because it
 * reads as though somebody checked: a reference to "Manager Experience 5.x" got
 * as far as a pull request description before the coverage gate noticed, and
 * the requirement had never existed.
 *
 * **A bare number means the original spec.** That convention was already in use
 * — 654 bare references against 100-odd qualified ones — and naming it is what
 * makes the rest checkable. Anything belonging to another spec has to say so,
 * which is how `10.2, 10.5, 10.6` in the test-mode files turned out to be
 * correct references to integration-hardening that read as broken ones to the
 * original.
 */

export interface SpecDocument {
  /** The directory name, e.g. `explaining-itself`. */
  slug: string;
  /** The contents of its requirements.md. */
  text: string;
}

/** Requirement key (`18`, `NFR 2`) to the number of acceptance criteria it lists. */
type RequirementMap = Map<string, number>;

export interface ReferenceIndex {
  specs: Map<string, RequirementMap>;
}

/** The spec a bare number refers to. */
export const DEFAULT_SPEC = 'team-health-check';

/**
 * Prefixes used in the codebase that are not the directory name.
 *
 * `Original` and `Integration` predate the convention and are in too many files
 * to be worth rewriting; naming them here costs one line each and keeps the
 * churn out of files nobody is otherwise touching.
 */
const ALIASES: Record<string, string> = {
  original: DEFAULT_SPEC,
  integration: 'integration-hardening',
};

/** `Explaining Itself` and `explaining-itself` are the same spec. */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function buildIndex(documents: readonly SpecDocument[]): ReferenceIndex {
  const specs = new Map<string, RequirementMap>();

  for (const document of documents) {
    const requirements: RequirementMap = new Map();
    let current: string | null = null;

    for (const line of document.text.split(/\r?\n/)) {
      const heading = line.match(/^###\s+(NFR\s+\d+|Requirement\s+\d+)/i);

      if (heading) {
        const label = heading[1].replace(/\s+/g, ' ');
        current = /^nfr/i.test(label)
          ? `NFR ${label.split(/\s+/)[1]}`
          : label.split(/\s+/)[1];
        requirements.set(current, 0);
        continue;
      }

      // Acceptance criteria are a numbered list under the heading
      if (current !== null && /^\d+\.\s/.test(line.trim())) {
        requirements.set(current, (requirements.get(current) ?? 0) + 1);
      }
    }

    specs.set(document.slug, requirements);
  }

  return { specs };
}

export interface Reference {
  /** The spec slug this reference names, or the default for a bare one. */
  spec: string;
  /** `18` or `NFR 2`. */
  requirement: string;
  criterion: number;
  /** As written, for an error message somebody has to act on. */
  raw: string;
}

/**
 * Every requirement reference on a `Requirements:` line.
 *
 * Handles the forms in use: bare `4.10`, qualified `Explaining Itself 1.4`,
 * `NFR 2.1`, several separated by commas or semicolons, and ranges like
 * `2.1-2.3`, where each end is checked and the middle is assumed.
 */
export function parseReferences(line: string): Reference[] {
  const body = line.replace(/^.*?Requirements?:\s*/i, '');
  const references: Reference[] = [];

  /*
   * A spec named once applies to the numbers after it.
   *
   * "Integration 10.2, 10.5, 10.6" is how a person writes three references to
   * one spec and how the next person reads them. Attributing only the first
   * would leave the convention unusable — the alternative is repeating the name
   * three times, which nobody will do and no reviewer would enforce.
   *
   * A semicolon ends the run, because that is how the existing citations group
   * them: "4.6; Integration 10.2" is two groups, not one.
   */
  let carried = DEFAULT_SPEC;
  let cursor = 0;

  /*
   * A prefix is one or more capitalised words immediately before the number.
   * `NFR` is one of them, and stays with the requirement rather than naming a
   * spec: `NFR 2.1` is requirement "NFR 2", criterion 1.
   */
  const pattern = /((?:[A-Z][A-Za-z]*\s+)*)(\d+)\.(\d+)/g;

  for (const match of body.matchAll(pattern)) {
    const [raw, prefix, requirement, criterion] = match;
    const words = prefix.trim();

    // A semicolon since the last reference ends the run
    if (body.slice(cursor, match.index).includes(';')) {
      carried = DEFAULT_SPEC;
    }
    cursor = (match.index ?? 0) + raw.length;

    if (/^NFR$/i.test(words)) {
      references.push({
        spec: carried,
        requirement: `NFR ${requirement}`,
        criterion: Number(criterion),
        raw: raw.trim(),
      });
      continue;
    }

    // A trailing `NFR` after a spec name: "Explaining Itself NFR 2.1"
    const nfrQualified = words.match(/^(.*)\s+NFR$/i);
    const specWords = nfrQualified ? nfrQualified[1] : words;

    // A bare number continues whatever was named before it
    if (specWords !== '') {
      carried = ALIASES[slugify(specWords)] ?? slugify(specWords);
    }

    references.push({
      spec: carried,
      requirement: nfrQualified ? `NFR ${requirement}` : requirement,
      criterion: Number(criterion),
      raw: raw.trim(),
    });
  }

  return references;
}

export type ResolutionProblem =
  | { kind: 'unknown-spec'; reference: Reference }
  | { kind: 'unknown-requirement'; reference: Reference }
  | { kind: 'unknown-criterion'; reference: Reference; criteria: number };

/** Null when the reference resolves; otherwise what is wrong with it. */
export function resolve(index: ReferenceIndex, reference: Reference): ResolutionProblem | null {
  const spec = index.specs.get(reference.spec);
  if (!spec) return { kind: 'unknown-spec', reference };

  const criteria = spec.get(reference.requirement);
  if (criteria === undefined) return { kind: 'unknown-requirement', reference };

  /*
   * A criterion beyond the list is the interesting failure: it means the
   * requirement was trimmed after the code cited it, or the citation was
   * written from memory.
   */
  if (reference.criterion > criteria) {
    return { kind: 'unknown-criterion', reference, criteria };
  }

  return null;
}

export function describeProblem(problem: ResolutionProblem, file: string): string {
  const { reference } = problem;
  const where = `${file}: "${reference.raw}"`;

  switch (problem.kind) {
    case 'unknown-spec':
      return `${where} — no spec named "${reference.spec}"`;
    case 'unknown-requirement':
      return `${where} — ${reference.spec} has no Requirement ${reference.requirement}`;
    case 'unknown-criterion':
      return `${where} — ${reference.spec} Requirement ${reference.requirement} has ${problem.criteria} acceptance criteria`;
  }
}
