// app/landing/page.js
"use client";

import { FormEventHandler, useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const res = await fetch("/api/landingAuth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Incorrect password");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter Password"
      />
      <button type="submit">Submit</button>
      {error && <p>{error}</p>}
    </form>
  );
}
