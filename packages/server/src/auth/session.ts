import { v4 as uuid } from "uuid";
import { getGlobalRedisCache } from "../redis";


const SESSION_TTL = 1 * 24 * 60 * 60;

export interface SessionData {
   publicKey: string;
   privileges?: string[];
   createdAt: number;
}

export async function createSession(
   data: SessionData
): Promise<string> {
   const redis = await getGlobalRedisCache();
   const sid = uuid();
   await redis.set(`sid:${sid}`, JSON.stringify(data), SESSION_TTL);
   return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
   const redis = await getGlobalRedisCache();
   const raw = await redis.get(`sid:${sid}`);
   return raw ? (JSON.parse(raw) as SessionData) : null;
}

export async function destroySession(sid: string) {
   const redis = await getGlobalRedisCache();
   await redis.del(`sid:${sid}`);
}
