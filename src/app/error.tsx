'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-6xl font-bold text-white font-pp-mondwest">
          Oops!
        </h1>
        <h2 className="text-2xl text-[#d1d1d1]">
          Something went wrong
        </h2>
        <p className="text-[#8A8A8A] max-w-md mx-auto">
          {error?.message || "We encountered an unexpected error. Don't worry, our team has been notified."}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[#008011] text-white rounded-lg hover:bg-[#006b0e] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-[#f1f1f1] text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}