import { StakingPool } from "@/pages/staking";
import { formatNumber } from "@/utils";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type PoolListItemProps = {
  isTop?: boolean;
  pool: StakingPool;
};

function formatUnits(amount: string, decimals: number) {
  return parseFloat(amount) / Math.pow(10, decimals);
}

function getTokenLogo(tokenAddress: string | null) {
  if (!tokenAddress) return "/default-token-logo.svg";
  return `/tokens/${tokenAddress}.png`; // Assuming token logos are stored in this path
}

export default function PoolListItem({
  pool,
  isTop = false,
}: PoolListItemProps) {
  const [apy, setApy] = useState(Math.floor(Math.random() * 100) + 1);
  useEffect(() => {
    console.log(pool);
  }, []);
  return (
    <tr key={pool.id}>
      <td>
        <div className="flex items-center gap-3">
          {pool.mint.isLpToken ? (
            <div className="flex items-center -space-x-2">
              <img
                src={getTokenLogo(pool.mint.pairTokenAddress0)}
                alt=""
                className="h-6 w-6 rounded-full"
              />
              <img
                src={getTokenLogo(pool.mint.pairTokenAddress1)}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            </div>
          ) : (
            <div className="">
              <img
                src={pool.mint.image}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            </div>
          )}
          <div>
            <Link
              to={`/stake/${pool.id}`}
              className="font-bold hover:underline"
            >
              {pool.mint.isLpToken ? (
                <p>ai16z LP Token {pool.id}</p>
              ) : (
                <p>{pool.mint.symbol}</p>
              )}
            </Link>
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center gap-3">
          {pool.rewardMint.isLpToken ? (
            <div className="flex items-center -space-x-2">
              <img
                src={getTokenLogo(pool.rewardMint.pairTokenAddress0)}
                alt=""
                className="h-6 w-6 rounded-full"
              />
              <img
                src={getTokenLogo(pool.rewardMint.pairTokenAddress1)}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            </div>
          ) : (
            <div className="">
              <img
                src={pool.rewardMint.image}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            </div>
          )}
          <div className="flex items-center">
            <p className="font-bold">
              {`${formatNumber(
                formatUnits(
                  pool.rewardAmount,
                  parseInt(pool.rewardMint.decimals),
                ),
              )} ${
                pool.rewardMint.isLpToken
                  ? `ai16z LP Token ${pool.id}`
                  : pool.rewardMint.symbol
              }`}
            </p>
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center">
          <p className="font-bold">{apy}%</p>
        </div>
      </td>
      <td>
        <div className="flex items-center justify-center">
          <p className="font-bold">{pool.participants}</p>
        </div>
      </td>
      <th>
        <div className="flex justify-end">
          <Link to={`/stake/${pool.id}`} className="btn btn-secondary btn-sm">
            View Pool
          </Link>
        </div>
      </th>
    </tr>
  );
}
