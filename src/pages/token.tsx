import { getToken } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

export default function Page() {
  const params = useParams();
  const address = params?.address;

  const query = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      return await getToken({ address });
    },
    refetchInterval: 3_000,
  });

  return (
    <div className="whitespace-pre">
      {JSON.stringify(query?.data || {}, null, 4)}
    </div>
  );
}
