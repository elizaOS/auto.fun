"use client";

import { useEffect } from "react";
import { useProfile } from "./utils";

export default function Profile() {
  const { data: tokens, isLoading } = useProfile();

  useEffect(() => {
    console.log(tokens);
  }, [tokens]);

  if (isLoading) {
    // TODO: loading skeleton
    return null;
  }

  return <div>Profile</div>;
}
