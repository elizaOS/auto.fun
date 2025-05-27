"use server";

import { StakingPool } from "@/pages/staking";
// import { fallbackTokenLogo } from "@/utils/fallbackTokenLogo";
import { gql, request } from "graphql-request";

type Args = {
  isDevnet?: boolean;
};

// Placeholder function
export async function getPools(isDevnet: boolean): Promise<StakingPool[]> {
  const query = gql`
    {
      pools(first: 9) {
        id
        duration
        mint {
          id
          name
          symbol
          image
          decimals
          programId
        }
        rewardMint {
          id
          name
          symbol
          image
          decimals
          programId
        }
        totalStaked
        rewardAmount
        participants
      }
    }
  `;

  const rawData = (await request(process.env.INDEXER_URL as string, query)) as {
    pools: {
      id: string;
      duration: string;
      mint: {
        id: string;
        name: string | null;
        symbol: string | null;
        image: string | null;
        decimals: string;
        programId: string;
      };
      rewardMint: {
        id: string;
        name: string | null;
        symbol: string | null;
        image: string | null;
        decimals: string;
        programId: string;
      };
      totalStaked: string;
      rewardAmount: string;
      participants: number;
    }[];
  };

  const indexedPools = rawData.pools;

  return indexedPools.map((pool) => ({
    id: pool.id,
    duration: pool.duration,
    mint: {
      id: pool.mint.id,
      name: pool.mint.name ?? "Unknown Token",
      symbol: pool.mint.symbol ?? "???",
      decimals: pool.mint.decimals,
      image: pool.mint.image,
      isLpToken: false,
      pairTokenAddress0: null,
      pairTokenAddress1: null,
    },
    rewardMint: {
      id: pool.rewardMint.id,
      name: pool.rewardMint.name ?? "Unknown Token",
      symbol: pool.rewardMint.symbol ?? "???",
      decimals: pool.rewardMint.decimals,
      image: pool.rewardMint.image,
      isLpToken: false,
      pairTokenAddress0: null,
      pairTokenAddress1: null,
    },
    totalStaked: pool.totalStaked,
    rewardAmount: pool.rewardAmount,
    participants: pool.participants,
  })) as StakingPool[];
}

// These first to function signatures exist to provide type safety for the return value
// Old Function
// export async function getPools(isDevnet: boolean): Promise<StakingPool[]> {
//   const query = gql`
//     {
//       pools(first: 9) {
//         id
//         duration
//         mint {
//           id
//           name
//           symbol
//           image
//           decimals
//           programId
//         }
//         rewardMint {
//           id
//           name
//           symbol
//           image
//           decimals
//           programId
//         }
//         totalStaked
//         rewardAmount
//         participants
//       }
//     }
//   `;

//   const rawData = (await request(process.env.INDEXER_URL as string, query)) as {
//     pools: {
//       id: string;
//       duration: string;
//       mint: {
//         id: string;
//         name: string | null;
//         symbol: string | null;
//         image: string | null;
//         decimals: string;
//         programId: string;
//       };
//       rewardMint: {
//         id: string;
//         name: string | null;
//         symbol: string | null;
//         image: string | null;
//         decimals: string;
//         programId: string;
//       };
//       totalStaked: string;
//       rewardAmount: string;
//       participants: number;
//     }[];
//   };

//   let indexedPools = rawData.pools;

//   const tokenList: Array<(typeof indexedPools)[0]["mint"]> = [];

//   // Collect all unique token objects
//   indexedPools.forEach((pool) => {
//     // Find if token already exists in the list
//     const mintExists = tokenList.some(
//       (token) => token.id.toLowerCase() === pool.mint.id.toLowerCase(),
//     );
//     if (!mintExists) {
//       tokenList.push(pool.mint);
//     }

//     const rewardMintExists = tokenList.some(
//       (token) => token.id.toLowerCase() === pool.rewardMint.id.toLowerCase(),
//     );
//     if (!rewardMintExists) {
//       tokenList.push(pool.rewardMint);
//     }
//   });

//   const filteredPools = isFarms
//     ? indexedPools.filter((pool) =>
//         kaminoStrategyShareTokens.includes(pool.mint.id.toLowerCase()),
//       )
//     : indexedPools.filter(
//         (pool) =>
//           !kaminoStrategyShareTokens.includes(pool.mint.id.toLowerCase()),
//       );

//   const poolsStakingTokens = filteredPools.map((pool) =>
//     pool.mint.id.toLowerCase(),
//   );
//   const strategiesThatArePools = kaminoStrategiesList.filter((strategy) =>
//     poolsStakingTokens.includes(strategy.shareMint.toLowerCase()),
//   );

//   const allTokens = [
//     ...new Set([
//       ...filteredPools.map((pool) => [pool.mint, pool.rewardMint]).flat(),
//       ...strategiesThatArePools
//         .map((strategy) => {
//           const tokenAMint: Omit<
//             (typeof indexedPools)[0]["mint"],
//             "programId"
//           > & { programId: string | undefined } = {
//             id: strategy.tokenAMint,
//             name: "",
//             symbol: "",
//             image: "",
//             decimals: "",
//             programId: undefined,
//           };
//           const tokenBMint: Omit<
//             (typeof indexedPools)[0]["mint"],
//             "programId"
//           > & { programId: string | undefined } = {
//             id: strategy.tokenBMint,
//             name: "",
//             symbol: "",
//             image: "",
//             decimals: "",
//             programId: undefined,
//           };
//           return [tokenAMint, tokenBMint];
//         })
//         .flat(), // farmSingleTokenAddresses (i.e. token0 and token1)
//     ]),
//   ];

//   console.log("About to fetch token metadatas");

//   // Create an array of promises for fetching token metadata
//   const tokenMetadatas = await Promise.all(
//     allTokens.map((token) => {
//       return getTokenMetadata(token.id, true, token.programId, isDevnet);
//     }),
//   );
//   console.log("Toke meta", tokenMetadatas);

//   // Create a map for easy lookup by address
//   const tokenMetadataMap = new Map<
//     string,
//     Awaited<ReturnType<typeof getTokenMetadata>>
//   >();
//   allTokens.forEach((token, index) => {
//     tokenMetadataMap.set(token.id.toLowerCase(), tokenMetadatas[index]);
//   });

//   const stakingPools = filteredPools.map((pool) => {
//     const mintMetadata = tokenMetadataMap.get(pool.mint.id.toLowerCase());
//     const rewardMetadata = tokenMetadataMap.get(
//       pool.rewardMint.id.toLowerCase(),
//     );

//     const strategy = kaminoStrategiesList.find(
//       (strategy) =>
//         strategy.shareMint.toLowerCase() === pool.mint.id.toLowerCase(),
//     );

//     const token0Address = strategy?.tokenAMint;
//     const token1Address = strategy?.tokenBMint;

//     const token0Metadata =
//       isFarms && token0Address
//         ? tokenMetadataMap.get(token0Address.toLowerCase())
//         : undefined;
//     const token1Metadata =
//       isFarms && token1Address
//         ? tokenMetadataMap.get(token1Address.toLowerCase())
//         : undefined;

//     const token0 = {
//       id: token0Metadata?.address,
//       // address: strategy.tokenAMint,
//       name: token0Metadata?.name,
//       symbol: token0Metadata?.symbol,
//       image: token0Metadata?.image,
//       decimals: "9",
//       derivedETH: "0.333",
//     };

//     const token1 = {
//       id: token1Metadata?.address,
//       // address: strategy.tokenBMint,
//       name: token1Metadata?.name,
//       symbol: token1Metadata?.symbol,
//       image: token1Metadata?.image,
//       decimals: "9",
//       derivedETH: "0.333",
//     };

//     const formattedPool = isFarms
//       ? ({
//           ...pool,
//           id: strategy?.address,
//           startTimestamp: 100,
//           owner_id: "0x111",
//           endTimestamp: 200,
//           amountStaked: pool.totalStaked,
//           stakingToken: {
//             id: pool.mint.id,
//             name: mintMetadata?.name ?? "Unknown Token",
//             symbol: mintMetadata?.symbol ?? "???",
//             image: mintMetadata?.image ?? fallbackTokenLogo,
//             decimals: pool.mint.decimals,
//             derivedETH: "0.333",
//             isLpToken: true,
//             pairTokenAddress0: commonPairs[3].token0.address,
//             pairTokenAddress1: commonPairs[3].token1.address,
//           },
//           token0,
//           token1,
//           reward: {
//             amount: pool.rewardAmount,
//             token: {
//               id: pool.rewardMint.id,
//               name: rewardMetadata?.name ?? "Unknown Token",
//               symbol: rewardMetadata?.symbol ?? "???",
//               decimals: pool.rewardMint.decimals,
//               image: rewardMetadata?.image ?? fallbackTokenLogo,
//               derivedETH: "0.5",
//               isLpToken: false,
//               pairTokenAddress0: null,
//               pairTokenAddress1: null,
//             },
//           },
//         } as Farm)
//       : ({
//           id: pool.id,
//           duration: pool.duration,
//           rewardAmount: pool.rewardAmount,
//           totalStaked: pool.totalStaked,
//           participants: pool.participants,
//           mint: {
//             id: pool.mint.id,
//             name: mintMetadata?.name ?? "Unknown Token",
//             symbol: mintMetadata?.symbol ?? "???",
//             decimals: pool.mint.decimals,
//             image: mintMetadata?.image ?? fallbackTokenLogo,
//             isLpToken: false,
//             pairTokenAddress0: null,
//             pairTokenAddress1: null,
//           },
//           ...(token0Metadata && {
//             token0: {
//               id: token0Metadata.address,
//               name: token0Metadata.name,
//               symbol: token0Metadata.symbol,
//               decimals: "9",
//               image: token0Metadata.image,
//               derivedETH: "0.33",
//             },
//           }),
//           ...(token1Metadata && {
//             token1: {
//               id: token1Metadata.address,
//               name: token1Metadata.name,
//               symbol: token1Metadata.symbol,
//               decimals: "9",
//               image: token1Metadata.image,
//               derivedETH: "0.33",
//             },
//           }),
//           rewardMint: {
//             id: pool.rewardMint.id,
//             name: rewardMetadata?.name ?? "Unknown Token",
//             symbol: rewardMetadata?.symbol ?? "???",
//             decimals: pool.rewardMint.decimals,
//             image: rewardMetadata?.image ?? fallbackTokenLogo,
//             isLpToken: false,
//             pairTokenAddress0: null,
//             pairTokenAddress1: null,
//           },
//         } as StakingPool);
//     return formattedPool;
//   });

//   return stakingPools as StakingPool[];
// }

export const stakingSeeds = {
  pool: "pool",
  user: "user",
  tokenAccount: "staking_token_account",
  rewardTokenAccount: "reward_token_account",
} as const;
