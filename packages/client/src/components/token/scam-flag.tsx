import { Tooltip } from "react-tooltip";
import { Fragment } from "react/jsx-runtime";

export default function Verified({ isHidden }: { isHidden?: boolean }) {
  if (!isHidden) return null;
  return (
    <Fragment>
      <Tooltip anchorSelect="#verified">
        <span>Scam</span>
      </Tooltip>

      <img src="/warning.svg" id="verified" className="size-5 select-none" />
    </Fragment>
  );
}
