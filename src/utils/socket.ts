import { io, Socket } from "socket.io-client";
import { env } from "./env";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(env.contractApiUrl);
  }
  return socket;
};
