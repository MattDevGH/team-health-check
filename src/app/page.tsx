'use client';

/**
 * Homepage — entry point for unauthenticated users.
 * Provides navigation to the login flow (magic link request).
 */

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Team Health Check
        </h1>
        <p className="text-gray-600 mb-8">
          Lightweight feedback for delivery teams. Rate how things are going,
          track trends over time, and surface what needs attention.
        </p>

        <a
          href="/auth/login"
          className="inline-block w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sign in with magic link
        </a>

        <p className="mt-6 text-sm text-gray-600">
          Got a session link from Slack or email? Click it directly — no sign-in needed.
        </p>
      </div>
    </main>
  );
}
