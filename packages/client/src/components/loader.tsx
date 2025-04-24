import { twMerge } from "tailwind-merge";

export default function Loader({
  className,
  isFullscreen,
}: {
  className?: string;
  isFullscreen?: boolean;
}) {
  return (
    <div
      className={twMerge([
        "flex items-center justify-center h-[50vh]",
        isFullscreen
          ? "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          : "",
        className ? className : "",
      ])}
    >
      <img
        className="w-auto size-16 animate-wiggle animate-infinite animate-duration-200 animate-ease-linear"
        src="/dice.svg"
        alt="logo"
      />
    </div>
  );
}
