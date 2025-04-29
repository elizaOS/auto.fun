import { useTokens } from "@/hooks/use-tokens";
import { IToken } from "@/types";
import { GridItem } from "./grid-view";

export default function FeaturedSection() {
  const query = useTokens({
    sortBy: "featured",
    sortOrder: "desc",
    enabled: true,
  });

  const items = (query?.items || []).splice(0, 4);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
      {items?.map((token: IToken) => (
        <GridItem key={token.mint} token={token} />
      ))}
    </div>
  );
}
