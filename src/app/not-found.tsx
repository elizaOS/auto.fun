import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-8xl font-bold text-white font-pp-mondwest">
          404
        </h1>
        <h2 className="text-2xl text-[#d1d1d1]">
          Page Not Found
        </h2>
        <p className="text-[#8A8A8A] max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="px-6 py-3 bg-[#008011] text-white rounded-lg hover:bg-[#006b0e] inline-block transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}