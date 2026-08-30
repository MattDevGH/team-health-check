/**
 * Shared display formatting.
 * Requirements: Manager Experience 3.7
 */

interface PluraliseOptions {
  /** Set false to render only the noun, when the count is shown separately. */
  includeCount?: boolean;
}

/**
 * Renders a count with its noun, agreeing in number.
 *
 * English pluralises on "exactly one", not "more than one": zero takes the
 * plural. The dashboard read "1 responses" before this existed, which is the
 * kind of detail that makes a tool feel unfinished to the people being asked to
 * trust it with their team's morale.
 *
 * `plural` is for nouns that do not simply take an "s".
 */
export function pluralise(
  count: number,
  singular: string,
  plural?: string,
  options: PluraliseOptions = {},
): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`);

  return options.includeCount === false ? noun : `${count} ${noun}`;
}
