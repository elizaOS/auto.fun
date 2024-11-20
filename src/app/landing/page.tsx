// app/landing/page.js
"use client";

import { FormEventHandler, useState } from "react";
import { useRouter } from "next/navigation";
import { ParallaxVideo } from "@/app/landing/ParallaxVideo";
import { FormInput } from "@/components/common/input/FormInput";
import { toast } from "react-toastify";

export default function LandingPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    try {
      const res = await fetch("/api/landingAuth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
      } else if (res.status >= 500) {
        toast.error("Server error. Please try again later.");
      } else {
        setError(true);
      }
    } catch {
      toast.error("Server error. Please try again later.");
    }
  };

  return (
    <div className="absolute h-full top-0 w-full flex flex-col pb-[10%] items-center">
      <ParallaxVideo />

      <form
        onSubmit={handleSubmit}
        className={`flex items-end gap-3 ${error && "!text-[#ff0000]"}`}
      >
        <FormInput
          label="Enter to awaken..."
          type="password"
          onChange={(event) => setPassword(event.target.value)}
        />

        <button
          type="submit"
          disabled={!password}
          className="disabled:opacity-60"
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="44" height="44" rx="12" fill="#03FF24" />
            <path
              d="M22.8333 22V22.0083M14.5 29.5H29.5M16.1667 29.5V16.1667C16.1667 15.7246 16.3423 15.3007 16.6548 14.9882C16.9674 14.6756 17.3913 14.5 17.8333 14.5H24.0833M26.1667 23.25V29.5M23.6667 17.8333H29.5M29.5 17.8333L27 15.3333M29.5 17.8333L27 20.3333"
              stroke="black"
              strokeWidth="1.66667"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
