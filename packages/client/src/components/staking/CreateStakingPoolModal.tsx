"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useNavigate } from "react-router";
import Loader from "../loader";
// import { useStakingProgram } from "../stake/staking-data-access";
import { useCreateStakingPool } from "@/hooks/use-create-staking-pool";
import { useProgramStaking } from "@/utils/programStaking";
import DurationSelectSection from "./DurationSelectSelection";

export default function CreateStakingPoolModal() {
  const navigate = useNavigate();
  const stakingProgram = useProgramStaking();

  const { mutateAsync } = useCreateStakingPool();
  const programId = stakingProgram?.programId; // Placeholder for actual programId
  //   const programId = useMemo(
  //     () => getStakingProgramId(cluster.network as Cluster),
  //     [cluster],
  //   );
  const [mint, setMint] = useState("");
  const [rewardMint, setRewardMint] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(0);

  async function initializePool() {
    // Throw error if mint is not a valid public key
    if (!programId) return;
    const mintPubkey = new PublicKey(mint);
    const rewardMintPubkey = new PublicKey(rewardMint);

    try {
      setIsInitializing(true);

      const [poolId] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool"),
          mintPubkey.toBuffer(),
          rewardMintPubkey.toBuffer(),
        ],
        programId,
      );

      await mutateAsync({
        mint,
        rewardMint,
        duration: totalSeconds,
      });

      navigate(`/stake/${poolId}`);
    } catch (error) {
      console.log(error);
    } finally {
      setIsInitializing(false);
    }
  }

  return (
    <dialog id="create-staking-pool-modal" className="modal">
      <div className="modal-box border border-neutral">
        <form method="dialog">
          {/* if there is a button in form, it will close the modal */}
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>
        <h3 className="font-bold text-lg">Create A Staking Pool</h3>
        <div className="mt-5 space-y-4">
          <div className="flex flex-col mb-2 space-y-2">
            <input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              disabled={isInitializing}
              className="input input-bordered join-item"
              placeholder="Mint Address"
            />

            <input
              value={rewardMint}
              onChange={(e) => setRewardMint(e.target.value)}
              disabled={isInitializing}
              className="input input-bordered join-item"
              placeholder="Reward Mint Address"
            />

            <DurationSelectSection
              totalSeconds={totalSeconds}
              setTotalSeconds={setTotalSeconds}
              isCreatingPool={isInitializing}
            />
          </div>

          <button
            onClick={initializePool}
            disabled={isInitializing}
            className="btn btn-secondary w-full mt-20 flex items-center justify-center"
          >
            {isInitializing && <Loader />}
            {isInitializing ? "Creating Pool..." : "Create Pool"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
