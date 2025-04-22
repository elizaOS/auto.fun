import { useState } from "react";

export default function usePause() {
  const [paused, setPause] = useState<boolean>(false);
  return { paused, setPause };
}
