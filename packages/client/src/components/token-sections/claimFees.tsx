import { fetchWithAuth } from "@/hooks/use-authentication";
import { env } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

export default function ClaimFees({ tokenMint }: { tokenMint: string }) {
  const { mutate: claimFees, isPending } = useMutation({
    mutationFn: async () => {
      if (!tokenMint) {
        throw new Error("No token found");
      }

      const response = await fetchWithAuth(`${env.apiUrl}/api/claimFees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tokenMint }),
      });

      if (!response.ok) {
        throw new Error("Failed to claim fees");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Fees claimed successfully");
    },
    onError: (error) => {
      console.error("Error claiming fees:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to claim fees",
      );
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => claimFees()}
        disabled={isPending}
        className="cursor-pointer text-white text-center bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight hover:text-black border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-full items-center justify-center"
      >
        <span className="w-full text-center">
          {isPending ? "Claiming..." : "Claim Fees"}
        </span>
      </button>
    </div>
  );
}
