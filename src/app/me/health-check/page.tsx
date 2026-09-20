'use client';

/**
 * The member's own health check.
 *
 * Requirements: Reaching Your Health Check 1.2, 1.3, 1.4, 1.5
 *
 * A route that answers "is there anything for me to do?" from anywhere in the
 * application, for any member rather than only a Delivery Manager. A
 * contributor's journey never touches the dashboard — they arrive from a
 * prompt, answer, and leave — so when a check opened on 2026-09-14 and no
 * prompt could reach anyone, there was nowhere for them to go.
 *
 * Under `/me` because that segment already mounts the navigation shell, and
 * because this is genuinely about the reader rather than the team.
 */

import { useEffect, useState } from 'react';

const ABOUT_HEADING_ID = 'about-the-health-check';
const THEMES_HEADING_ID = 'health-check-themes';

/**
 * The five themes, in the order they are asked.
 *
 * Requirements: Explaining Itself 6.3
 *
 * Written for somebody who has not seen the form, rather than copied from the
 * catalogue: the stored descriptions are the questions themselves, and reading
 * five questions here would make this page the form rather than a look ahead
 * at it. They are duplicated deliberately and a test names both, so a change to
 * the catalogue that leaves this behind is visible.
 */
const HEALTH_CHECK_THEMES = [
  { title: 'Delivering Value', description: 'whether the work is reaching the people it is for' },
  { title: 'Team Collaboration', description: 'how well the team works together and supports each other' },
  { title: 'Ease of Delivery', description: 'how much friction stands between an idea and it being done' },
  { title: 'Learning and Improving', description: 'whether the team gets better at what it does' },
  { title: 'Psychological Safety', description: 'whether it feels safe to speak up, disagree, or be wrong' },
];

type CheckState =
  | { phase: 'loading' }
  | { phase: 'open'; token: string }
  | { phase: 'none_open' }
  | { phase: 'no_link' }
  | { phase: 'error' };

interface Resolved {
  kind: string;
  token?: string;
}

function isResolved(value: unknown): value is Resolved {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

export default function MyHealthCheckPage() {
  const [state, setState] = useState<CheckState>({ phase: 'loading' });

  useEffect(() => {
    let current = true;

    async function load() {
      try {
        const res = await fetch('/api/me/health-check');
        if (!res.ok) {
          if (current) setState({ phase: 'error' });
          return;
        }

        const body: unknown = await res.json();
        if (!current) return;

        if (isResolved(body) && body.kind === 'open' && typeof body.token === 'string') {
          setState({ phase: 'open', token: body.token });
        } else if (isResolved(body) && body.kind === 'no_link') {
          setState({ phase: 'no_link' });
        } else {
          setState({ phase: 'none_open' });
        }
      } catch {
        if (current) setState({ phase: 'error' });
      }
    }

    load();

    return () => {
      current = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Health check</h1>

        <div className="bg-white rounded-lg shadow p-6">
          {state.phase === 'loading' && <p className="text-gray-600">Loading...</p>}

          {state.phase === 'open' && (
            <>
              <p className="text-gray-700 mb-4">
                A health check is open. Your answers are saved as you go, and you can change
                them until it closes.
              </p>
              {/*
                A link rather than an automatic redirect. Landing straight in a
                form having clicked "Health check" gives no moment to realise
                what is about to be asked, and no way back without the browser
                button.
              */}
              <a
                href={`/session/${state.token}`}
                className="inline-block py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Answer the health check
              </a>
            </>
          )}

          {state.phase === 'none_open' && (
            <p className="text-gray-700">
              No health check is open at the moment. You will be prompted when the next one
              starts, and this page will have it.
            </p>
          )}

          {state.phase === 'no_link' && (
            /*
              A member added after the check opened has no link for it. Saying
              "nothing is open" here would be false, and handing them another
              member's link would let them answer as that person.
            */
            <p className="text-gray-700">
              A health check is open, but you were not included in it — this happens when
              you join a team after a check has started. Your delivery manager can include
              you in the next one.
            </p>
          )}

          {state.phase === 'error' && (
            <p className="text-red-600" role="alert">
              Could not load your health check. Please try again.
            </p>
          )}
        </div>
        {/*
          What a health check is, before being asked to answer one.

          Requirements: Explaining Itself 6.3, 6.4

          This route was built as a deliberate pause before the form — a moment
          to see what is about to be asked, rather than landing in it having
          clicked "Health check". Twice in production it read instead as a step
          that achieved nothing, because the pause had nothing in it: a button,
          and then the same button again.

          So the pause has its content now. That is the whole justification for
          the extra click, and a page that loses this goes back to being a step
          that achieved nothing.

          Rendered whether or not a check is open. Most visits from the
          navigation find nothing collecting, and explaining only when there is
          something to do would put the explanation on exactly the visits where
          nobody has time to read it.
        */}
        <section
          aria-labelledby={ABOUT_HEADING_ID}
          className="bg-white rounded-lg shadow p-6 mt-4"
        >
          <h2 id={ABOUT_HEADING_ID} className="text-lg font-semibold text-gray-800">
            About the health check
          </h2>
          <p className="mt-2 text-gray-700">
            The same five short questions, every time. You score each one from 1 to 5
            and can say whether you think it is improving, stable or declining. It
            takes a couple of minutes.
          </p>
          <p className="mt-2 text-gray-700">
            Answering the same questions repeatedly is what makes the answers worth
            anything: one check is a snapshot, and several show your team which way
            things are moving. Your delivery manager reads the team&rsquo;s pattern over
            time rather than any single answer.
          </p>

          <h3 id={THEMES_HEADING_ID} className="mt-4 font-medium text-gray-800">
            What you will be asked about
          </h3>
          {/*
            A list rather than a paragraph of commas: five named things are a
            list, and a screen reader announces how many there are, which is the
            number somebody deciding whether to start actually wants.
          */}
          <ul aria-labelledby={THEMES_HEADING_ID} className="mt-2 space-y-2">
            {HEALTH_CHECK_THEMES.map(theme => (
              <li key={theme.title} className="text-sm text-gray-700">
                <span className="font-medium text-gray-800">{theme.title}</span> —{' '}
                {theme.description}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-gray-600">
            You can change your answers as often as you like until the check closes, so
            a first thought is not a final one.
          </p>
        </section>
      </div>
    </div>
  );
}
