import {
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
} from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";
import Button from "./button"; // Assuming a reusable Button component exists
import React from "react";

const diceIcons = [
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
];

export const DiceButton: React.FC = () => {
  const { cycleTheme, currentThemeIndex } = useThemeStore();

  // Calculate which dice face to show (1-6)
  const diceNumber = (currentThemeIndex % 6) + 1;
  const DiceIcon = diceIcons[diceNumber - 1];

  return (
    <Button
      variant="outline"
      size="small"
      onClick={cycleTheme}
      className="border-accent text-accent hover:bg-accent hover:text-autofun-background-primary transition-colors p-2"
      aria-label="Change theme"
    >
      <DiceIcon className="size-5" />
    </Button>
  );
};
