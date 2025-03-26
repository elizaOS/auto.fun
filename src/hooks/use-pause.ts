import { useState } from "react";

export default function usePause() {
  const [pause, setPause] = useState<boolean>(false);
  return { pause, setPause };
}
