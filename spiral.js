import { length } from "./vec2.js";
import { sort } from "./sort.js";

// Color settings
export const settings = {
  fps: 60,
  backgroundColor: "black", // Set background to black
  color: "#03FF24", // Set foreground color to green
};

const { sin, cos, floor, PI, atan, sqrt, pow } = Math;
const TAU = PI * 2;

const density = sort("▅▃▁?ab012:. ", "Simple Console", false);

export function main(coord, context, cursor, buffer) {
  const t = context.time * 0.0006;
  const m = Math.min(context.cols, context.rows);
  const a = context.metrics.aspect;

  let st = {
    x: ((2.0 * (coord.x - context.cols / 2)) / m) * a,
    y: (2.0 * (coord.y - context.rows / 2)) / m,
  };

  const radius = length(st);
  const rot = 0.03 * TAU * t;
  const turn = atan(st.y, st.x) / TAU + rot;

  const n_sub = 1.5;

  const turn_sub = (n_sub * turn) % n_sub;

  const k = 0.1 * sin(3.0 * t);
  const s = k * sin(50.0 * (pow(radius, 0.1) - 0.4 * t));
  const turn_sine = turn_sub + s;

  const i_turn = floor((density.length * turn_sine) % density.length);
  const i_radius = floor(1.5 / pow(radius * 0.5, 0.6) + 5.0 * t);
  const idx = (i_turn + i_radius) % density.length;

  // Return object with character and color
  return {
    char: density[idx],
    color: "#03FF24",
    backgroundColor: "black",
  };
}
