import { FormInput } from "@/pages/create";
import CopyButton from "../copy-button";
import { useState } from "react";
import { Icons } from "../icons";

export default function AdminTab() {
  // Error state
  // const [errors, setErrors] = useState({
  //   name: "",
  //   symbol: "",
  //   description: "",
  //   prompt: "",
  // });

  // Simple form state
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

    // Clear errors immediately when field has a value
    // if (field === "name" || field === "symbol" || field === "description") {
    //   if (value) {
    //     setErrors((prev) => ({
    //       ...prev,
    //       [field]: "",
    //     }));
    //   } else {
    //     setErrors((prev) => ({
    //       ...prev,
    //       [field]: `${field.charAt(0).toUpperCase() + field.slice(1)} is required`,
    //     }));
    //   }
    // }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
        Socials
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <button
        type="submit"
        className="cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center"
      >
        Save
      </button>
    </div>
  );
}
