import { TwitterCredentials } from "@/app/(home)/form.types";
import { womboApi } from "./fetch";
import { z } from "zod";

export const validateTwitterCredentials = async (
  credentials: TwitterCredentials,
) => {
  try {
    const response = await womboApi.post({
      endpoint: "/verify",
      body: {
        twitterUsername: credentials.username,
        twitterEmail: credentials.email,
        twitterPassword: credentials.password,
      },
      schema: z.object({
        verified: z.boolean(),
      }),
    });

    return response.verified ? "valid" : "invalid";
  } catch {
    return "unknown_error";
  }
};
