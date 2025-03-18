import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import SkeletonImage from "@/components/skeleton-image";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array(12)
          .fill("A")
          .map((token, _) => (
            <div
              key={_}
              className="bg-autofun-background-card p-4 rounded-md border"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <SkeletonImage
                    src={`https://picsum.photos/seed/${_}/200/200`}
                    alt="image"
                    className="size-32"
                  />

                  <div className="flex flex-col gap-3 grow justify-between">
                    {/* Token Info and Time */}
                    <div className="flex self-stretch items-center w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-autofun-text-primary text-base font-medium font-satoshi leading-normal">
                          Waifu
                        </span>
                        <span className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest">
                          $WAIFU
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded-md border flex ml-auto">
                        <span className="text-autofun-text-secondary text-xs font-medium font-dm-mono">
                          17 min
                        </span>
                      </div>
                    </div>
                    {/* Marketcap & Address */}
                    <div className="flex flex-col w-full">
                      <div className="flex items-center justify-between w-full">
                        <div className="text-autofun-text-secondary text-xs font-medium font-satoshi">
                          Market Cap
                        </div>
                        <div className="text-autofun-text-secondary text-xs font-normal font-dm-mono">
                          49n...ump
                        </div>
                      </div>
                      <div className="inline-flex justify-start items-center gap-2">
                        <div className="justify-start text-autofun-text-highlight text-xl font-normal font-dm-mono leading-7">
                          $123K
                        </div>
                      </div>
                    </div>
                    {/* Bonding Curve */}
                    <div className="flex items-center gap-2">
                      <div className="text-autofun-text-info text-sm font-medium font-dm-mono">
                        Bonding Curve Progress
                      </div>
                      <div className="text-autofun-text-highlight text-sm font-normal font-dm-mono">
                        28%
                      </div>
                    </div>
                    <BondingCurveBar progress={50} />
                  </div>
                </div>

                <div className="flex-1 self-stretch justify-start">
                  <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight">
                    Rorem ipsum dolor sit amet, consectetur adipiscing elit.
                    Nunc vulputate libero et{" "}
                  </span>
                  <span className="text-autofun-text-primary text-xs font-normal font-dm-mono leading-tight">
                    See More...
                  </span>
                </div>
                <Button variant="primary" size="large">
                  Buy
                </Button>
                <Button variant="secondary">Buy</Button>
                <Button variant="primary" disabled>
                  Buy
                </Button>
                <Button variant="secondary" isLoading>
                  Buy
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
