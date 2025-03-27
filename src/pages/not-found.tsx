export default function PageNotFound() {
  return (
    <div className="mt-44 flex justify-center items-center ml-auto">
      <div className="flex flex-col text-center space-y-6 md:space-y-14 lg:space-y-24 text-autofun-background-action-highlight w-full text-5xl md:text-7xl lg:text-8xl font-dm-mono">
        <h1>page not found</h1>
        <p className="text-white text-base md:text-1xl lg:text-2xl font-semibold">
          Oops! The page you're looking for doesn't exist.
        </p>
      </div>
    </div>
  );
}
