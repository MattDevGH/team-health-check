/**
 * First-run guidance.
 * Requirements: Manager Experience 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * Tells a delivery manager what to do next, so setting the tool up does not
 * require a written guide.
 *
 * Every item is derived from data the page has already loaded, on every render.
 * Nothing is stored and nothing can be dismissed: guidance disappears when the
 * condition it describes stops being true, and not before. A banner that can be
 * dismissed while still true is a banner that stops telling the truth.
 */

import Link from 'next/link';

export interface GuidanceItem {
  id: string;
  message: string;
  action?: { href: string; label: string };
}

interface GuidanceBannerProps {
  items: GuidanceItem[];
}

export function GuidanceBanner({ items }: GuidanceBannerProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Next steps"
      className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4"
    >
      <h2 className="mb-2 text-sm font-semibold text-blue-900">Next steps</h2>
      <ul className="space-y-2 text-sm text-blue-900">
        {items.map(item => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
            <span>{item.message}</span>
            {item.action && (
              <Link href={item.action.href} className="font-medium underline">
                {item.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
