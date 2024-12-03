import { NextRequest, NextResponse } from "next/server";
import { AuthenticationStatus } from "../../../../../types/api/auth/index.type";

export const GET = async (
  request: NextRequest,
): Promise<NextResponse<AuthenticationStatus>> => {
  const publicKey = request.cookies.get("publicKey")?.value;

  return NextResponse.json({ authenticated: publicKey !== undefined });
};
