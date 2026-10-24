// Evaluate every expression in homogeneous coordinates N/D, together with
// interval automatic derivatives. This is an arithmetic backend, not an AST
// classifier: even expressions without a division have the same N/D record.
import * as ranges from './interval.js';
import * as baseSlopes from './slope-interval.js';
import * as monotone from './monotone-interval.js';

// Carry the same algebra over two relaxations: actual coordinate derivatives
// and independent intermediate coordinates. Neither chooses by formula shape.
const slopes={...baseSlopes};
slopes.interval=value=>({...baseSlopes.interval(value),relaxation:monotone.interval(value)});
for(const name of ['add','subtract','multiply','divide'])slopes[name]=(first,second)=>({
  ...baseSlopes[name](first,second),relaxation:monotone[name](first.relaxation,second.relaxation),
});
slopes.negate=value=>({...baseSlopes.negate(value),relaxation:monotone.negate(value.relaxation)});
slopes.power=(value,exponent)=>{
  const result=baseSlopes.power(value,exponent);
  return {...result,relaxation:monotone.power(value.relaxation,exponent,result.range)};
};
slopes.unary=(name,value)=>{
  const result=baseSlopes.unary(name,value);
  return {...result,relaxation:monotone.unary(name,value.relaxation,result.range)};
};
slopes.binary=(name,first,second)=>{
  const result=baseSlopes.binary(name,first,second);
  return {...result,relaxation:monotone.binary(name,first.relaxation,second.relaxation,result.range)};
};

const one = slopes.interval(1);
const lift = value => ({value, numerator:value, denominator:one});
export const interval = value => lift(slopes.interval(value));
export function variable(lower,upper,axis,context) {
  const value = slopes.variable(lower,upper,lower+(upper-lower)/2,axis);
  // Allow the anchor to range over the whole box. The slope identities then
  // enclose derivatives at every anchor, rather than secants at one anchor.
  return lift({...value,center:value.range,relaxation:monotone.atom(axis===0?'x':'y',value.range,context)});
}
function affine(first,second,operation) {
  return {
    value:operation(first.value,second.value),
    numerator:operation(slopes.multiply(first.numerator,second.denominator),slopes.multiply(second.numerator,first.denominator)),
    denominator:slopes.multiply(first.denominator,second.denominator),
  };
}
export const add = (first,second) => affine(first,second,slopes.add);
export const subtract = (first,second) => affine(first,second,slopes.subtract);
export const negate = item => ({value:slopes.negate(item.value),numerator:slopes.negate(item.numerator),denominator:item.denominator});
export const multiply = (first,second) => ({
  value:slopes.multiply(first.value,second.value),
  numerator:slopes.multiply(first.numerator,second.numerator),
  denominator:slopes.multiply(first.denominator,second.denominator),
});
export const divide = (first,second) => ({
  value:slopes.divide(first.value,second.value),
  numerator:slopes.multiply(first.numerator,second.denominator),
  denominator:slopes.multiply(first.denominator,second.numerator),
});
export function power(item,exponent) {
  const value=slopes.power(item.value,exponent);
  if(!Number.isInteger(exponent))return lift(value);
  const numerator=slopes.power(item.numerator,Math.abs(exponent));
  const denominator=slopes.power(item.denominator,Math.abs(exponent));
  return {value,numerator:exponent<0?denominator:numerator,denominator:exponent<0?numerator:denominator};
}
export const unary = (name,item) => lift(slopes.unary(name,item.value));
export const binary = (name,first,second) => lift(slopes.binary(name,first.value,second.value));

const direction = value => {
  if(!value.continuous||!ranges.bounded(value))return 0;
  const [lower,upper]=ranges.hull(value);
  return lower>=0 ? 1 : upper<=0 ? -1 : 0;
};
export function enclose(evaluate,bounds) {
  const at = box => {
    const context=monotone.createContext();
    return evaluate(variable(box[0],box[1],0,context),variable(box[2],box[3],1,context));
  };
  const result=at(bounds),numerator=result.numerator,denominator=result.denominator.range;
  if(!ranges.bounded(numerator.range)||!ranges.bounded(denominator))return result.value.range;
  let range=monotone.enclose(numerator.relaxation);
  if(numerator.supported){
    const dx=direction(numerator.sx),dy=direction(numerator.sy);
    if(dx||dy){
      const face = upper => {
        const box=[...bounds];
        for(const [axis,sign]of [[0,dx],[2,dy]])if(sign){
          const endpoint=bounds[axis+(upper ? sign>0 : sign<0)];
          box[axis]=box[axis+1]=endpoint;
        }
        return at(box).numerator.range;
      };
      const lower=face(false),upper=face(true);
      // Monotonicity is certified over the whole box, so extrema lie on
      // these faces. Re-evaluation there avoids a huge secant/denominator
      // estimate when a box nearly touches a removable singularity.
      if(ranges.bounded(lower)&&ranges.bounded(upper))range=slopes.intersection(range,ranges.interval(ranges.hull(lower)[0],ranges.hull(upper)[1]));
    }
  }
  return slopes.intersection(result.value.range,ranges.divide(range,denominator));
}
