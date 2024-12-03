import { cookies } from "next/headers";

export const DELETE = async () => {
  try {
    (await cookies()).delete("publicKey");

    return new Response(null, {
      status: 204,
    });
  } catch (err) {
    console.error(err);
    return new Response("Server error while deleting cookie", {
      status: 500,
    });
  }
};
