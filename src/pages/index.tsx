import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Divider from "@/components/divider";
import SkeletonImage from "@/components/skeleton-image";
import { useQuery } from "@tanstack/react-query";
import { faker } from "@faker-js/faker";
import { abbreviateNumber, moment, shortenAddress } from "@/utils";
import GridListSwitcher from "@/components/grid-list-switcher";
import { TableView } from "@/components/table-view";

export default function Page() {
  const query = useQuery({
    queryKey: ["tokens"],

    queryFn: async () => {
      function createRandomToken() {
        return {
          name: faker.lorem.word({ length: { min: 3, max: 5 } }),
          symbol: faker.finance.currency().code,
          image: faker.image.dataUri({ width: 200, height: 200 }),
          address: faker.finance.ethereumAddress(),
          marketcap: faker.number.int({ min: 12_000, max: 3_000_000 }),
          createdAt: faker.date.recent(),
          bondingCurvePercentage: faker.number.int({ min: 1, max: 100 }),
          description: faker.lorem.lines(3),
        };
      }
      return faker.helpers.multiple(createRandomToken, {
        count: 12,
      });
    },
    refetchInterval: 1_000,
  });

  const data = query?.data;

  return (
    <div className="flex flex-col gap-4">
      {/* Top Navigation */}
      <div className="flex items-center gap-3 flex-wrap-reverse lg:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-3">
          <Button variant="outline">All</Button>
          <Button>Market Cap</Button>
          <Button variant="outline">Creation Time</Button>
        </div>
      </div>
      {true ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {data?.map((token, _) => (
            <div
              key={token.address}
              className="bg-autofun-background-card p-4 rounded-lg border flex flex-col gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <SkeletonImage
                  src={token.image}
                  alt="image"
                  className="aspect-square w-34 grow shrink-0"
                />
                <div className="flex flex-col gap-3 justify-between grow min-w-0">
                  {/* Token Info and Time */}
                  <div className="flex items-center w-full min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0">
                        {token.name}
                      </div>
                      <div className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
                        ${token.symbol}
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-md border flex ml-auto shrink-0">
                      <div className="text-autofun-text-secondary text-xs font-medium font-dm-mono">
                        {moment(token.createdAt).fromNow()}
                      </div>
                    </div>
                  </div>

                  {/* Marketcap & Address */}
                  <div className="flex flex-col w-full min-w-0">
                    <div className="flex items-center justify-between w-full min-w-0">
                      <div className="text-autofun-text-secondary text-xs font-medium font-satoshi">
                        Market Cap
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-autofun-text-secondary text-xs font-normal font-dm-mono">
                          {shortenAddress(token.address)}
                        </div>
                        <CopyButton text="Hello World" className="size-4" />
                      </div>
                    </div>
                    <div className="inline-flex justify-start items-center gap-2 min-w-0">
                      <div className="justify-start text-autofun-text-highlight text-xl font-normal font-dm-mono leading-7 truncate">
                        ${abbreviateNumber(token.marketcap)}
                      </div>
                    </div>
                  </div>

                  {/* Bonding Curve */}
                  <div className="flex items-center gap-2">
                    <div className="text-autofun-text-info text-sm font-medium font-dm-mono">
                      Bonding Curve Progress
                    </div>
                    <div className="text-autofun-text-highlight text-sm font-normal font-dm-mono">
                      {token.bondingCurvePercentage}%
                    </div>
                  </div>
                  <BondingCurveBar progress={token.bondingCurvePercentage} />
                </div>
              </div>

              <div className="flex-1 self-stretch justify-start">
                <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight line-clamp-2">
                  {token.description}
                </span>
                <span className="text-autofun-text-primary text-xs font-normal font-dm-mono leading-tight">
                  See More...
                </span>
              </div>
              <Divider />
              <Button
                variant="primary"
                size="large"
                className="hover:border-autofun-stroke-highlight"
              >
                Buy
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <TableView data={data} />
      )}
    </div>
  );
}
