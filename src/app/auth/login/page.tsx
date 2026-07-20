/**
 * Magic Link Request Page
 *
 * Requirements: 7.1, 7.8
 * - Provides "Request access link" function using only email address
 * - Allows requests from login page without prior authentication
 * - Displays generic success message regardless of email existence (anti-enumeration)
 */

'use client';

import { useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // Intentionally swallow errors — anti-enumeration (Requirement 7.8)
    }

    // Always show success regardless of response (anti-enumeration)
    setIsSubmitting(false);
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Check your email</h1>
          <p className="text-gray-600">
            If your email is registered, you&apos;ll receive a magic link shortly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Request access link</h1>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isSubmitting}
          />
          {error && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending...' : 'Request access link'}
          </button>
        </form>
      </div>
    </main>
  );
}
