import { Personality } from "./index.type";

export type PersonalitiesProps = {
  allPersonalities: Personality[];
  onChange: (selectedPersonalities: number[]) => void;
  selectedPersonalities: number[];
};
