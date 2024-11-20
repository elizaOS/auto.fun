// app/api/authenticate/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password === "typeshit") {
    const response = NextResponse.json({ success: true });
    response.cookies.set("authorized", "true", {
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } else {
    return NextResponse.json({ success: false }, { status: 401 });
  }
}
