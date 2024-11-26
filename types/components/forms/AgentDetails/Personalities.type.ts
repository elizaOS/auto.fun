import { Personality } from "./index.type";

export type PersonalitiesProps = {
  allPersonalities: Personality[];
  onChange: (selectedPersonalities: string[]) => void;
  selectedPersonalities: string[];
};
