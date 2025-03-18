export default function BondingCurveBar({ progress }: { progress: number }) {
  return (
    <div className="relative">
      {/* Background */}
      <div className="absolute left-0 h-2 w-full bg-autofun-stroke-primary rounded-md" />
      {/* Progress */}
      <div
        className="absolute left-0 h-2 bg-gradient-to-r from-green-900 to-green-500 rounded-md z-20 transition-colors duration-200"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
