import * as ranges from './interval.js';

// Orthogonal affine transforms preserve the original formulas and sampling
// algorithms. Interval boxes are transformed conservatively, with rounding.
export function transformRanges(matrix, x, y, arithmetic = ranges) {
  const component = (a, b, offset) => {
    const term = (weight, value) => weight === 0 ? arithmetic.interval(0) : arithmetic.multiply(arithmetic.interval(weight), value);
    return arithmetic.add(arithmetic.add(term(a, x), term(b, y)), arithmetic.interval(offset));
  };
  return { x: component(matrix[0], matrix[2], matrix[4]), y: component(matrix[1], matrix[3], matrix[5]) };
}

export function transformEquation(equation, matrix) {
  if (!matrix) return equation;
  const [a, b, c, d, tx, ty] = matrix;
  const determinant = a * d - b * c;
  const inverse = [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * ty - d * tx) / determinant, (b * tx - a * ty) / determinant];
  const local = (x, y) => [inverse[0] * x + inverse[2] * y + inverse[4], inverse[1] * x + inverse[3] * y + inverse[5]];
  return {
    ...equation,
    evaluate: (x, y) => equation.evaluate(...local(x, y)),
    gradient: (x, y) => {
      const [value, dx, dy] = equation.gradient(...local(x, y));
      return [value, inverse[0] * dx + inverse[1] * dy, inverse[2] * dx + inverse[3] * dy];
    },
    interval: (x0, x1, y0, y1) => {
      const box = transformRanges(inverse, ranges.interval(x0, x1), ranges.interval(y0, y1));
      const x = ranges.hull(box.x), y = ranges.hull(box.y);
      return equation.interval(x[0], x[1], y[0], y[1]);
    },
  };
}

export function transformParametric(curve, matrix, boxArithmetic) {
  if (!matrix) return curve;
  const [a, b, c, d, tx, ty] = matrix;
  const apply = (point, translate = true) => ({ x: a * point.x + c * point.y + (translate ? tx : 0), y: b * point.x + d * point.y + (translate ? ty : 0) });
  return {
    ...curve,
    evaluate: t => apply(curve.evaluate(t)),
    derivative: t => apply(curve.derivative(t), false),
    interval: (lower, upper) => { const box = curve.interval(lower, upper); return transformRanges(matrix, box.x, box.y); },
    intervalBoxes: (lower, upper) => { const box = curve.intervalBoxes(lower, upper); return transformRanges(matrix, box.x, box.y, boxArithmetic); },
  };
}
