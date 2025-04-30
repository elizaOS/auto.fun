import clsx from "clsx";

const directionMap = {
  up: "clip-path-triangle-up",
  down: "clip-path-triangle-down",
  left: "clip-path-triangle-left",
  right: "clip-path-triangle-right",
};

const Triangle = ({
  size = "size-4",
  color = "bg-black",
  direction = "up",
}) => {
  return (
    <div
      // @ts-ignore
      className={clsx(size, color, "triangle", directionMap[direction])}
    ></div>
  );
};

export default Triangle;
