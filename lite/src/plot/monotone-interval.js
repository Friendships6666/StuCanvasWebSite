// Lift intermediate nonlinear values to independent interval coordinates.
// Repeated values share a coordinate; monotonicity in those coordinates gives
// another enclosure of the original expression, even when x/y derivatives
// cannot establish monotonicity (e.g. rapidly oscillating intermediates).
import * as ranges from './interval.js';
import { intersection } from './slope-interval.js';
const zero=ranges.interval(0),one=ranges.interval(1);
const valid=value=>value.continuous&&ranges.bounded(value);
const scale=(a,b)=>ranges.isZero(a)||ranges.isZero(b)?zero:ranges.multiply(a,b);

export const interval=value=>({key:`#${value}`,range:ranges.interval(value),partials:new Map(),atoms:new Map(),at:()=>ranges.interval(value)});
export function createContext(){
  const ids=new Map(),nodes=new Map();
  const id=key=>{if(!ids.has(key))ids.set(key,ids.size);return ids.get(key);};
  return {node:(name,first,second)=>{
    const signature=`${name}:${id(first)}:${id(second)}`;
    if(!nodes.has(signature))nodes.set(signature,{});
    return nodes.get(signature);
  }};
}
const memoize=operation=>{
  const results=new WeakMap();
  return overrides=>{if(!results.has(overrides))results.set(overrides,operation(overrides));return results.get(overrides);};
};
export function atom(key,range,context){
  return {key,range,context,partials:new Map([[key,one]]),atoms:new Map([[key,range]]),at:overrides=>overrides.get(key)||range};
}
function combine(name,first,second,range,weightFirst,weightSecond,operation){
  const partials=new Map();
  for(const key of new Set([...first.partials.keys(),...second.partials.keys()])){
    partials.set(key,ranges.add(scale(weightFirst,first.partials.get(key)||zero),scale(weightSecond,second.partials.get(key)||zero)));
  }
  const context=first.context||second.context;
  return {key:context?context.node(name,first.key,second.key):{},context,range,partials,
    atoms:new Map([...first.atoms,...second.atoms]),
    at:memoize(overrides=>operation(first.at(overrides),second.at(overrides)))};
}
export const add=(a,b)=>combine('+',a,b,ranges.add(a.range,b.range),one,one,ranges.add);
export const subtract=(a,b)=>combine('-',a,b,ranges.subtract(a.range,b.range),one,ranges.interval(-1),ranges.subtract);
export const multiply=(a,b)=>combine('*',a,b,ranges.multiply(a.range,b.range),b.range,a.range,ranges.multiply);
export function divide(a,b){
  const range=ranges.divide(a.range,b.range),inverse=ranges.reciprocal(b.range);
  return combine('/',a,b,range,inverse,ranges.negate(ranges.multiply(range,inverse)),ranges.divide);
}
export const negate=value=>({key:value.context?value.context.node('neg',value.key):{},context:value.context,range:ranges.negate(value.range),
  partials:new Map([...value.partials].map(([key,range])=>[key,ranges.negate(range)])),atoms:value.atoms,
  at:memoize(overrides=>ranges.negate(value.at(overrides)))});
export const power=(value,exponent,range)=>atom(value.context?value.context.node('pow',value.key,`#${exponent}`):{},range,value.context);
export const unary=(name,value,range)=>atom(value.context?value.context.node(name,value.key):{},range,value.context);
export const binary=(name,first,second,range)=>{
  const context=first.context||second.context;
  return atom(context?context.node(name,first.key,second.key):{},range,context);
};

export function enclose(value){
  if(!valid(value.range))return value.range;
  const lower=new Map(),upper=new Map();
  for(const [key,derivative]of value.partials){
    if(!valid(derivative))continue;
    const [a,b]=ranges.hull(derivative),range=value.atoms.get(key);
    if(!valid(range))continue;
    const [lo,hi]=ranges.hull(range);
    if(a>=0){lower.set(key,ranges.interval(lo));upper.set(key,ranges.interval(hi));}
    else if(b<=0){lower.set(key,ranges.interval(hi));upper.set(key,ranges.interval(lo));}
  }
  if(!lower.size)return value.range;
  const lo=value.at(lower),hi=value.at(upper);
  if(!valid(lo)||!valid(hi))return value.range;
  return intersection(value.range,ranges.interval(ranges.hull(lo)[0],ranges.hull(hi)[1]));
}
