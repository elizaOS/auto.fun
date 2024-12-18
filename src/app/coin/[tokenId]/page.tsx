import { TokenMetadata } from "./TokenMetadata";
import { TokenGraph } from "./TokenGraph";
import { TokenMarketCap } from "./TokenMarketCap";
import { TokenBuySell } from "./TokenBuySell";
import { BottomTable } from "./BottomTable";

export default async function TokenDetailsPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 flex flex-col gap-2">
          <TokenMetadata mint={tokenId} />
          <TokenGraph />
        </div>

        <div className="flex flex-col gap-2">
          <TokenMarketCap mint={tokenId} />
          <TokenBuySell />
        </div>
      </div>
      <BottomTable />
    </div>
  );
}
