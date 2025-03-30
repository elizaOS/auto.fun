import { FormInput } from "@/pages/create";
import CopyButton from "../copy-button";
import { useState } from "react";
import { Icons } from "../icons";
import { toast } from "react-toastify";
import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken, removeTokenFromWallet } from "@/utils/api";
import Button from "../button";
import { env } from "@/utils/env";

export default function AdminTab() {
  const params = useParams();
  const address = params?.address;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Query to get token data (needed for verification)
  const tokenQuery = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      const data = await getToken({ address });
      return data;
    },
    enabled: !!address,
  });

  const token = tokenQuery?.data;

  // Social links form state
  const [form, setForm] = useState({
    description: "",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: "",
    },
  });

  // Token removal state
  const [removal, setRemoval] = useState({
    confirmName: "",
    isLoading: false,
  });

  const handleChange = (field: string, value: string) => {
    // Handle nested fields (for links)
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      setForm((prev) => {
        if (parent === "links") {
          return {
            ...prev,
            links: {
              ...prev.links,
              [child]: value,
            },
          };
        }
        return prev;
      });
    } else {
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handleRemovalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRemoval(prev => ({ 
      ...prev, 
      confirmName: e.target.value
    }));
  };

  const handleRemoveToken = async () => {
    if (!token?.name || removal.confirmName !== token.name || !address) {
      toast.error("Token name doesn't match");
      return;
    }

    setRemoval(prev => ({ ...prev, isLoading: true }));

    try {
      console.log(`Attempting to remove token with mint address: ${address}`);
      console.log(`Using API URL: ${env.apiUrl}/api/tokens/${address}/remove-from-wallet`);
      
      // Call the removeTokenFromWallet API function
      const result = await removeTokenFromWallet(address);
      console.log("Token removal result:", result);
      
      toast.success(`Token "${token.name}" removed from your wallet. You can import it again at any time.`);
      
      // Reset confirmation field
      setRemoval({ confirmName: "", isLoading: false });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({queryKey: ["token", address]});
      // Also invalidate the main tokens list to update the index page
      queryClient.invalidateQueries({queryKey: ["tokens"]});
      
      // Navigate back to profile page
      setTimeout(() => {
        navigate("/profile");
      }, 1500);
    } catch (error) {
      console.error("Error removing token:", error);
      toast.error(`Failed to remove token: ${(error as Error).message}`);
      setRemoval(prev => ({ ...prev, isLoading: false }));
    }
  };

  const isDeleteDisabled = !token?.name || removal.confirmName !== token.name || removal.isLoading;

  return (
    <div className="grid grid-cols-2 w-full h-full">
      <div className="justify-items-center grid col-span-2">
        <div className="flex w-4/5 md:w-2/3 mt-12 flex-col gap-3 ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
            <div className="grid md:col-span-2 mb-2 text-center uppercase font-dm-mono text-xl">
              Add project socials here
            </div>
            <FormInput
              type="text"
              value={form.links.website}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange("links.website", e.target.value)
              }
              isOptional
              inputTag={<Icons.Website />}
              placeholder="Website"
              rightIndicator={<CopyButton text={""} />}
            />
            <FormInput
              type="text"
              value={form.links.twitter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange("links.twitter", e.target.value)
              }
              isOptional
              inputTag={<Icons.Twitter />}
              placeholder="X (Twitter)"
              rightIndicator={<CopyButton text={form.links.twitter || ""} />}
            />
            <FormInput
              type="text"
              value={form.links.telegram}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange("links.telegram", e.target.value)
              }
              isOptional
              inputTag={<Icons.Telegram />}
              placeholder="Telegram"
              rightIndicator={<CopyButton text={form.links.telegram || ""} />}
            />
            <FormInput
              type="text"
              value={form.links.discord}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange("links.discord", e.target.value)
              }
              isOptional
              inputTag={<Icons.Discord />}
              placeholder="Discord"
              rightIndicator={<CopyButton text={form.links.discord || ""} />}
            />
          </div>
        </div>
      </div>
      <div className="grid mt-6 md:mt-0 col-span-2 justify-items-center w-full uppercase font-dm-mono text-xl">
        <div className="grid col-span-2 mb-4 items-center justify-items-center w-full">
          <button
            type="submit"
            className="cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center"
          >
            Save
          </button>
        </div>
      </div>

      {/* Token Removal Section */}
      <div className="col-span-2 border-t border-autofun-stroke-primary pt-8 mt-8 w-4/5 md:w-2/3 mx-auto">
        <div className="grid md:col-span-2 mb-2 text-center uppercase font-dm-mono text-xl text-autofun-text-primary">
          Remove Token
        </div>
        
        <div className="mt-4 bg-autofun-background-action-primary/20 p-4 mb-6 text-sm text-autofun-text-secondary border border-autofun-stroke-primary">
          <p className="mb-2">
            <strong>Warning:</strong> This will only remove the token from your wallet in our application.
          </p>
          <p>
            The token will still exist on the blockchain and can be imported again at any time.
            This action does not affect your actual wallet or blockchain holdings.
          </p>
        </div>
        
        <div className="mb-6">
          <FormInput
            label="Type token name to confirm"
            type="text"
            value={removal.confirmName}
            onChange={handleRemovalChange}
            placeholder={token?.name || "Token name"}
          />
        </div>
        
        <div className="flex justify-center">
          <Button
            className="bg-red-500/80 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-6 py-2"
            onClick={handleRemoveToken}
            disabled={isDeleteDisabled}
          >
            {removal.isLoading ? 'Removing...' : 'Remove Token'}
          </Button>
        </div>
      </div>
    </div>
  );
}
