"use client"
import { createContext } from 'react';

const UserContext = createContext({
    isLoading: false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setIsLoading: (value: boolean) => { },
})

export default UserContext;