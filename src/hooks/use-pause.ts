import { useState } from "react";



export default function usePause() {
    const [pause, setPause] = useState(false);
    return {pause, setPause}
}