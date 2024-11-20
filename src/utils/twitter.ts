import { TwitterCredentials } from "@/app/page";

export const validateTwitterCredentials = async (
  credentials: TwitterCredentials,
) => {
  try {
    const response = await fetch(
      "https://mint-coin.auto.fun/api/verify-twitter",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      },
    );

    if (response.ok) {
      return "valid";
    } else {
      return "invalid";
    }
  } catch {
    return "unknown_error";
  }
};
