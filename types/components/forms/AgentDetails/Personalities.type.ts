import { Personality } from "./index.type";

export type PersonalitiesProps = {
  personalities: Personality[];
  onChange: (selectedPersonalities: string[]) => void;
};
