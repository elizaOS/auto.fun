import SkeletonImage from "./skeleton-image";

export default function Loader() {
  return (
    <div className="flex items-center justify-center h-[50vh]">
      <div className="flex items-center flex-col gap-3">
        <SkeletonImage
          src="/logo_wide.svg"
          width={128}
          height={128}
          alt="logo"
          className="size-8 animate-pulse mx-auto"
        />
        <div className="font-dm-mono text-base text-autofun-text-secondary">
          Loading
        </div>
      </div>
    </div>
  );
}
