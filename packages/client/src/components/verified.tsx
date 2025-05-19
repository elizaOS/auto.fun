import { Tooltip } from "react-tooltip";
import { Fragment } from "react/jsx-runtime";

export default function Verified({ isVerified }: { isVerified?: boolean }) {
  if (!isVerified) return null;
  return (
    <Fragment>
      <Tooltip anchorSelect="#verified">
        <span>Verified</span>
      </Tooltip>

      <img
        src="/verified.svg"
        id="verified"
        className="size-4 lg:size-5 select-none"
      />
    </Fragment>
  );
}
