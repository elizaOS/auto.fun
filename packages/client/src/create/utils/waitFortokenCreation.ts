import { HomepageTokenSchema } from "@/hooks/use-tokens";
import { getSocket } from "@/utils/socket";

export const waitForTokenCreation = async (mint: string, timeout = 80_000) => {
  return new Promise<void>((resolve, reject) => {
    const socket = getSocket();

    const newTokenListener = (token: unknown) => {
      const { mint: newMint } = HomepageTokenSchema.parse(token);
      if (newMint === mint) {
        clearTimeout(timerId);
        socket.off("newToken", newTokenListener);
        resolve();
      }
    };

    socket.emit("subscribeGlobal");
    socket.on("newToken", newTokenListener);

    const timerId = setTimeout(() => {
      socket.off("newToken", newTokenListener);
      reject(new Error("Token creation timed out"));
    }, timeout);
  });
};
