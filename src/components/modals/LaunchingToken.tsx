import { Spinner } from "../common/loading/Spinner";

export const LaunchingToken = () => {
  return (
    <div className="border-[#03FF24] border-[1px] border-solid rounded-3xl bg-black flex flex-col items-center p-6 gap-6">
      <Spinner />
      <p className="p-3 bg-[#03FF24] text-black rounded-lg font-bold">
        Launching Token to pump.fun...
      </p>
    </div>
  );
};
