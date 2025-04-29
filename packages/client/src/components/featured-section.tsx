import { useTokens } from "@/hooks/use-tokens";
import { IToken } from "@/types";
import { GridItem } from "./grid-view";
import Loader from "./loader";

export default function FeaturedSection() {
  const query = useTokens({
    sortBy: "featured",
    sortOrder: "desc",
    enabled: true,
    hideImported: 1
  });

  const items = (query?.items || []).splice(0, 4);

  if(query?.isLoading){
    return <Loader/>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
      {items?.map((token: IToken) => (
        <GridItem key={token.mint} token={token} />
      ))}
    </div>
  );
}
