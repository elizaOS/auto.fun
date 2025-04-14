import Button from "./button";
import { Grid, List } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useViewMode } from "@/hooks/use-view-mode";

export default function GridListSwitcher() {
  const [activeTab, setActiveTab] = useViewMode();
  return (
    <div className="flex bg-autofun-background-card mr-3">
      <Button
        className={twMerge([
          "cursor-pointer px-4 py-2 border-0",
          activeTab === "grid" ? "" : "bg-transparent",
        ])}
        onClick={() => setActiveTab("grid")}
        aria-label="grid"
      >
        <Grid color="#eee" size={24} />
      </Button>
      <Button
        className={twMerge([
          "cursor-pointer px-4 py-2 border-0",
          activeTab === "list" ? "" : "bg-transparent",
        ])}
        onClick={() => setActiveTab("list")}
        aria-label="list"
      >
        <List className="size-6" />
      </Button>
    </div>
  );
}
