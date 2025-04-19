import Button from "./button";
import { Grid, List } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useViewMode } from "@/hooks/use-view-mode";

export default function GridListSwitcher() {
  const [activeTab, setActiveTab] = useViewMode();
  return (
    <div className="flex bg-autofun-background-card">
      <Button
        className={twMerge([
          "cursor-pointer px-2 md:px-4 md:py-2 border-0",
          activeTab === "grid" ? "border-2 border-[#2FD345]" : "",
        ])}
        onClick={() => setActiveTab("grid")}
        aria-label="grid"
      >
        <Grid color="#eee" size={24} />
      </Button>
      <Button
        className={twMerge([
          "cursor-pointer px-2 md:px-4 md:py-2 border-0",
          activeTab === "list" ? "border-2 border-[#2FD345]" : "",
        ])}
        onClick={() => setActiveTab("list")}
        aria-label="list"
      >
        <List className="size-6" />
      </Button>
    </div>
  );
}
