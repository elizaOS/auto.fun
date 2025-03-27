import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

export default function PageNotFound() {
  return (
    <div className="mt-44 flex justify-center items-center ml-auto">
      <div className="flex flex-col space-y-12 text-center text-autofun-background-action-highlight w-full font-dm-mono">
        <div className="text-4xl md:text-7xl lg:text-8xl space-y-8">
          <h1>page not found</h1>
          <p className="text-white text-base md:text-1xl lg:text-2xl font-semibold">
            Oops! The page you're looking for doesn't exist.
          </p>
        </div>
        <div className="justify-items-center">
          <Link
            className="text-white bg-transparent gap-x-3 border-2 border-autofun-background-action-highlight flex px-8 py-4 flex-row w-fit items-center justify-items-center"
            to={"/"}
          >
            <ArrowLeft />
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
