import Button from "./button";
import { Grid, List } from "lucide-react";
import { useViewMode } from "@/hooks/use-view-mode";

export default function GridListSwitcher() {
  const [activeTab, setActiveTab] = useViewMode();
  return (
    <div className="flex bg-autofun-background-card">
      <Button
        variant={activeTab === "grid" ? "primary" : "outline"}
        onClick={() => setActiveTab("grid")}
        aria-label="grid"
      >
        <Grid color="#eee" size={24} />
      </Button>
      <Button
        variant={activeTab === "list" ? "primary" : "outline"}
        onClick={() => setActiveTab("list")}
        aria-label="list"
      >
        <List className="size-6" />
      </Button>
    </div>
  );
}
