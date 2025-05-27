"use client";

import Loader from "@/components/loader";
import CreateStakingPoolModal from "@/components/staking/CreateStakingPoolModal";
import PoolListItem from "@/components/staking/PoolListItem";
import { getPools } from "@/utils/stakingUtils";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { isDevnet } from "../utils/env";

export type StakingPool = {
  id: string;
  duration: string;
  mint: {
    id: string;
    name: string;
    symbol: string;
    decimals: string;
    image: string;
    isLpToken: boolean;
    pairTokenAddress0: string | null;
    pairTokenAddress1: string | null;
  };
  rewardMint: {
    id: string;
    name: string;
    symbol: string;
    decimals: string;
    image: string;
    isLpToken: boolean;
    pairTokenAddress0: string | null;
    pairTokenAddress1: string | null;
  };
  totalStaked: string;
  rewardAmount: string;
  participants: number;
};

export default function PoolsPage() {
  const { publicKey } = useWallet();

  const [isLoadingStakingPools, setIsLoadingStakingPools] = useState(true);
  const [stakingPools, setStakingPools] = useState<StakingPool[]>([]);

  useEffect(() => {
    getStakingPools();
  }, []);

  async function getStakingPools() {
    try {
      setIsLoadingStakingPools(true);

      const fetchedPools = await getPools(isDevnet);

      setStakingPools(fetchedPools);
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoadingStakingPools(false);
    }
  }

  return (
    <div className="relative w-full flex px-2 md:p-0">
      <div className="hidden md:block fixed top-0 left-0 h-screen w-1/5">
        <img
          src="/staking/left-panel-stake.png"
          alt=""
          className="absolute top-14 h-full w-full object-cover object-top"
        />
      </div>
      <div className="w-full md:w-3/5 md:ml-[20%] md:pt-4">
        <div className="py-6 sm:mb-5">
          <div className="container px-2 md:px-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h2 className="page-title font-sans">Staking Pools</h2>
                  <p className="font-sans max-w-[600px] text-neutral-300 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                    Stake tokens and earn yield
                  </p>
                </div>
              </div>
              <img
                src="/ai16z-eliza-assets/COIN_PLATFORM.png"
                alt=""
                className="hidden sm:flex -ml-20 h-12 sm:h-36"
              />
            </div>
          </div>
        </div>

        <div className="w-full flex justify-center items-center">
          <img
            src="/ai16z-eliza-assets/COIN_PLATFORM.png"
            alt=""
            className="sm:hidden h-12"
          />
        </div>

        <div className="flex justify-center">
          <div className="w-full space-y-6">
            <div className="w-full sm:p-4 space-y-3">
              <div className="relative">
                {isLoadingStakingPools ? (
                  <div className="flex items-center flex-col justify-center my-12">
                    <Loader />
                    <p className="animate-pulse font-bold mt-4 text-lg">
                      Loading Staking Pools
                    </p>
                  </div>
                ) : (
                  <div>
                    {stakingPools.length > 0 ? (
                      <>
                        {/* <img
                          src="/ai16z-eliza-assets/IMG_03.png"
                          alt=""
                          className="absolute -top-9 -left-10 -rotate-12 h-16 z-20"
                        /> */}
                        <div className="mt-8 md:mt-0">
                          <div className="overflow-x-auto w-full card outline outline-gray-600">
                            <table className="table table-zebra w-full mb-8">
                              <thead>
                                <tr>
                                  <th>Staking Token</th>
                                  <th>Rewards</th>
                                  <th>APY</th>
                                  <th>Participants</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {stakingPools.map((pool) => (
                                  <PoolListItem key={pool.id} pool={pool} />
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div>
                            <button
                              onClick={() =>
                                (
                                  document.getElementById(
                                    "create-staking-pool-modal",
                                  ) as HTMLFormElement
                                ).showModal()
                              }
                              className="btn btn-primary btn-outline w-full hover:btn-filled mt-4"
                            >
                              Create A Pool
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-between my-12 text-center text-tertiary-500">
                        <p className="text-lg">No Pools Found</p>
                        <button
                          onClick={() =>
                            (
                              document.getElementById(
                                "create-staking-pool-modal",
                              ) as HTMLFormElement
                            ).showModal()
                          }
                          className="btn btn-secondary mt-2 font-semibold"
                        >
                          Create One
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden md:block fixed top-0 right-0 h-screen w-1/5">
        <img
          src="/staking/right-panel-stake.png"
          alt=""
          className="absolute top-14 h-full w-full object-cover object-right-top"
        />
      </div>
      <CreateStakingPoolModal />
    </div>
  );
}
