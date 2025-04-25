import Button from "./button";
import { Grid, List } from "lucide-react";
import { useViewMode } from "@/hooks/use-view-mode";
import { useEffect } from "react";

export default function GridListSwitcher() {
  const [activeTab, setActiveTab] = useViewMode();

  // Load saved view mode on component mount
  useEffect(() => {
    const savedViewMode = localStorage.getItem("viewMode");
    if (savedViewMode && (savedViewMode === "grid" || savedViewMode === "list")) {
      setActiveTab(savedViewMode);
    }
  }, [setActiveTab]);

  // Toggle view mode and save to localStorage
  const toggleViewMode = () => {
    const newMode = activeTab === "grid" ? "list" : "grid";
    setActiveTab(newMode);
    localStorage.setItem("viewMode", newMode);
  };

  // Save to localStorage when activeTab changes directly
  const handleSetActiveTab = (mode) => {
    setActiveTab(mode);
    localStorage.setItem("viewMode", mode);
  };

  return (
    <>
      {/* Two buttons shown on sm screens and larger */}
      <div className="hidden sm:flex items-center gap-1">
        <Button
          variant={activeTab === "grid" ? "primary" : "outline"}
          onClick={() => handleSetActiveTab("grid")}
          aria-label="grid"
          className="p-2"
        >
          <Grid color="#eee" size={24} />
        </Button>
        <Button
          variant={activeTab === "list" ? "primary" : "outline"}
          onClick={() => handleSetActiveTab("list")}
          className="p-2"
          aria-label="list"
        >
          <List className="size-6" />
        </Button>
      </div>

      {/* Single toggle button shown below sm screens */}
      <div className="block sm:hidden">
        <Button
          variant="outline"
          onClick={toggleViewMode}
          aria-label={
            activeTab === "grid" ? "Switch to list view" : "Switch to grid view"
          }
          className="p-2"
        >
          {activeTab === "grid" ? (
            <Grid color="#eee" size={24} /> // Show Grid icon when grid is active
          ) : (
            <List className="size-6" /> // Show List icon when list is active
          )}
        </Button>
      </div>
    </>
  );
}
