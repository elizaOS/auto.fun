import { forwardRef } from "react";

export const Description = forwardRef<HTMLDialogElement>((_, ref) => {
  return (
    <dialog ref={ref} className="rounded-2xl bg-white">
      <div className="p-4 flex flex-col gap-6 w-[450px]">
        <div className="flex flex-col gap-3">
          <p className="font-bold">
            Launch AI Agents in 5 mins. No VC overlords. Just pure memetics.
          </p>
          <ol className="text-[#575757]">
            <li>
              1. Slap a name on your agent and tell us its vibe. (Yes, vibes
              matter)
            </li>
            <li>2. Link its Twitter so it can shitpost autonomously</li>
            <li>3. Launch your token on pump.fun and unleash chaos</li>
          </ol>
          <p className="font-bold text-[#575757]">
            LAUNCH THE CULT LEADER YOUR PARENTS FEARED.
          </p>
        </div>
      </div>
    </dialog>
  );
});

Description.displayName = "Description";
