import { useState } from "react";



export default function usePauseHook(value: boolean) {
    const [pause, setPause] = useState(value);
    return {pause, setPause}
}