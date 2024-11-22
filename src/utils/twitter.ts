import { TwitterCredentials } from "@/app/page";
import { API_URL } from "./env";

export const validateTwitterCredentials = async (
  credentials: TwitterCredentials,
) => {
  try {
    const response = await fetch(`${API_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        twitterUsername: credentials.username,
        twitterEmail: credentials.email,
        twitterPassword: credentials.password,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json.verified) {
        return "valid";
      }
      return "invalid";
    } else {
      return "invalid";
    }
  } catch {
    return "unknown_error";
  }
};
