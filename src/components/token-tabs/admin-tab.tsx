import { FormInput } from "@/pages/create";
import CopyButton from "../copy-button";
import { useState } from "react";
import { Icons } from "../icons";

export default function AdminTab() {
  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
  });

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
    if (field === "name" || field === "symbol" || field === "description") {
      if (value) {
        setErrors((prev) => ({
          ...prev,
          [field]: "",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [field]: `${field.charAt(0).toUpperCase() + field.slice(1)} is required`,
        }));
      }
    }
  };

  return (
    <div className="grid grid-cols-1 w-full bg-yellow-500 h-full">
      <div className="bg-red-500 flex justify-items-center items-center">
        <textarea
          value={form.description}
          className="w-2/3 h-full bg-[#0F0F0F] p-3 border border-neutral-800 text-white resize-none"
          placeholder="Describe the image you want to generate..."
        />
      </div>
      <div className="items-center justify-items-center">
        <div className="flex w-2/3 tems-center justify-center flex-col gap-3 h-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
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
    </div>
  );
}
