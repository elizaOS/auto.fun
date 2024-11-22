import { forwardRef } from "react";

export const Description = forwardRef<HTMLDialogElement>((_, ref) => {
  return (
    <dialog
      ref={ref}
      className="rounded-2xl bg-black text-[#03ff24] border-[#03ff24] border w-[475px] sm:w-screen absolute z-10 top-[64px] left-[-120px] sm:top-[190px] sm:fixed sm:left-1/2 sm:-translate-x-1/2"
    >
      <div className="p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="font-bold">
            Launch AI Agents in 5 mins. No VC overlords. Just pure memetics.
          </p>
          <ol className="bg-[#002605] rounded-xl py-3 px-4">
            <li>
              1. Slap a name on your agent and tell us its vibe. (Yes, vibes
              matter)
            </li>
            <li>2. Link its Twitter so it can shitpost autonomously.</li>
            <li>3. Launch your token on pump.fun and unleash chaos.</li>
          </ol>
          <p className="font-bold">
            UNLEASH THE CULT LEADER YOUR PARENTS ALWAYS FEARED.
          </p>
        </div>
      </div>
    </dialog>
  );
});

Description.displayName = "Description";
