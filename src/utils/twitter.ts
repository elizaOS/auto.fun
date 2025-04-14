import { TwitterCredentials } from "../../types/form.type";
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
      validateStatus: (status) => {
        const success = status >= 200 && status < 299;
        const verificationFailure = status === 400;

        // backend returns 400 if credentials invalid,
        // so we need to parse it as a 'success' state here
        return success || verificationFailure;
      },
    });

    return response.verified ? "valid" : "invalid";
  } catch {
    return "unknown_error";
  }
};
