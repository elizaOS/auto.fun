import { womboApi } from "@/utils/fetch";
import { TokenSchema } from "@/utils/tokenSchema";
import { ImageResponse } from "next/og";

export const runtime = "edge";

// Image metadata
const size = {
  width: 1200,
  height: 630,
};
const borderRadius = 20;

export const contentType = "image/png";

// Image generation
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#generate-images-using-code-js-ts-tsx
export default async function Image({
  params,
}: {
  params: { tokenId: string };
}) {
  // TODO: maybe implement fallback image if any of these requests fail
  const fontData = await fetch(
    new URL("../../fonts/PPMondwest-Regular.otf", import.meta.url),
  ).then((res) => res.arrayBuffer());

  const token = await womboApi.get({
    endpoint: `/tokens/${params.tokenId}`,
    schema: TokenSchema,
  });

  const logoSrc = await fetch(
    new URL("../../../../public/logo_rounded_25percent.png", import.meta.url),
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          color: "white",
          background:
            "linear-gradient(to bottom, rgb(91, 22, 71), rgb(71, 21, 52))",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: borderRadius,
          fontFamily: "PPMondwest",
        }}
      >
        <div
          style={{
            paddingTop: "50px",
            paddingLeft: "20px",
            width: "630px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <p style={{ fontSize: 90 }}>${token.ticker}</p>
            <p
              style={{
                fontSize: 45,
                wordWrap: "break-word",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}
            >
              {token.name}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingBottom: 30,
            }}
          >
            <img
              // typing is weird https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#using-edge-runtime-with-local-assets
              // @ts-expect-error to allow array buffer as src property
              src={logoSrc}
              width="64px"
              height="64px"
              alt="Logo"
            />
            <p style={{ fontSize: 25 }}>auto.fun</p>
          </div>
        </div>
        <img
          width="600px"
          height="100%"
          src={token.image}
          style={{
            borderTopRightRadius: borderRadius,
            borderBottomRightRadius: borderRadius,
          }}
          alt="Token Image"
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "PPMondwest",
          data: fontData,
          style: "normal",
        },
      ],
    },
  );
}
