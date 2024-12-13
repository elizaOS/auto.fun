"use client";

export const Tweet = () => {
  // TODO: waiting for updated designs so we can inspect the element in figma properly
  return (
    <>
      <blockquote className="twitter-tweet">
        <p lang="en" dir="ltr">
          At dawn from the gateway to Mars, the launch of Starship’s second
          flight test{" "}
          <a href="https://t.co/ffKnsVKwG4">pic.twitter.com/ffKnsVKwG4</a>
        </p>
        &mdash; SpaceX (@SpaceX){" "}
        <a href="https://twitter.com/SpaceX/status/1732824684683784516?ref_src=twsrc%5Etfw">
          December 7, 2023
        </a>
      </blockquote>{" "}
      <script
        async
        src="https://platform.twitter.com/widgets.js"
        charSet="utf-8"
      ></script>
    </>
  );
};
