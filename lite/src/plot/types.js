export const isPlot = object => !!object && (object.type === 'equation' || object.type === 'parametric');

export const plotSourceKey = object => object.type === 'parametric' ? JSON.stringify([object.xSource, object.ySource, object.tMin, object.tMax, object.plotTransform]) : object.plotTransform ? JSON.stringify([object.source, object.plotTransform]) : object.source;
