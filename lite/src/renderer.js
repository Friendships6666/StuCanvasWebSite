import { LocalizedError } from './i18n.js';
import { getTheme, rgba } from './themes.js';
import { PhysicsTextureCache } from './physics-material.js';
const sampleCount = 4;
const shader = /* wgsl */ `
struct Viewport { size: vec2f, ratio: f32, padding: f32 }
struct Shape { bounds: vec4f, geometry: vec4f, style: vec4f, color: vec4f, fill: vec4f }
@group(0) @binding(0) var<uniform> viewport: Viewport;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
struct Material { origin: vec2f, angle: f32, tileSize: f32, tint: vec4f }
@group(1) @binding(0) var<uniform> material: Material;
@group(1) @binding(1) var materialSampler: sampler;
@group(1) @binding(2) var materialImage: texture_2d<f32>;
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(1) @interpolate(flat) index: u32,
}
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOutput {
  let corners = array<vec2f, 3>(vec2f(0, 0), vec2f(2, 0), vec2f(0, 2));
  let shape = shapes[instance];
  var pixel = shape.bounds.xy + corners[vertex] * shape.bounds.zw;
  if (u32(shape.style.x) == 6u || u32(shape.style.x) == 7u) {
    let points = array<vec2f, 3>(shape.geometry.xy, shape.geometry.zw, shape.style.zw);
    pixel = points[vertex];
  } else if (u32(shape.style.x) == 5u) {
    // Rasterize in the rectangle's own orientation. The axis-aligned bounding
    // box of a rotated subpixel strip can cover thousands of times its area.
    // A rasterization margin absorbs hardware vertex quantization; binary
    // fragment coverage still clips to the actual geometric edge.
    let local = (corners[vertex] * 2.0 - 1.0) * (shape.geometry.zw + vec2f(0.25 / viewport.ratio));
    let cosine = cos(shape.style.z);
    let sine = sin(shape.style.z);
    pixel = shape.geometry.xy + vec2f(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  }
  var output: VertexOutput;
  output.position = vec4f(pixel / viewport.size * vec2f(2, -2) + vec2f(-1, 1), 0, 1);
  output.index = instance;
  return output;
}
fn shade(input: VertexOutput) -> vec4f {
  let shape = shapes[input.index];
  // Interpolating a varying across extremely thin triangles loses precision.
  let pixel = input.position.xy / viewport.ratio;
  let kind = u32(shape.style.x);
  let materialOffset = pixel - material.origin;
  let materialCosine = cos(material.angle);
  let materialSine = sin(material.angle);
  let materialLocal = vec2f(materialOffset.x * materialCosine + materialOffset.y * materialSine, -materialOffset.x * materialSine + materialOffset.y * materialCosine);
  let dimensions = vec2f(textureDimensions(materialImage));
  let uv = materialLocal / vec2f(dimensions.x / dimensions.y, 1.0) / max(material.tileSize, 0.0001);
  let uvDx = dpdx(uv);
  let uvDy = dpdy(uv);
  var signedDistance = 0.0;
  var radial = 0.0;
  if (kind == 0u) {
    let direction = shape.geometry.zw - shape.geometry.xy;
    let relative = pixel - shape.geometry.xy;
    let parameter = clamp(dot(relative, direction) / max(dot(direction, direction), 0.000001), 0.0, 1.0);
    signedDistance = length(relative - parameter * direction) - shape.style.y;
  } else if (kind == 1u || kind == 2u) {
    radial = length(pixel - shape.geometry.xy) - shape.style.z;
    signedDistance = select(abs(radial) - shape.style.y, radial, kind == 1u);
  } else if (kind == 5u) {
    let offset = pixel - shape.geometry.xy;
    let cosine = cos(shape.style.z);
    let sine = sin(shape.style.z);
    let local = vec2f(offset.x * cosine + offset.y * sine, -offset.x * sine + offset.y * cosine);
    let edge = abs(local) - shape.geometry.zw;
    signedDistance = length(max(edge, vec2f(0.0))) + min(max(edge.x, edge.y), 0.0);
  } else if (kind == 4u || kind == 6u || kind == 7u) {
    signedDistance = -1.0;
  } else {
    let relative = pixel - viewport.size * 0.5;
    let equation = dot(relative, relative) * shape.geometry.w + 2.0 * dot(relative, shape.geometry.xy) + shape.geometry.z;
    let circleDistance = equation / (sqrt(max(0.0, 1.0 + equation * shape.geometry.w)) + 1.0);
    signedDistance = abs(circleDistance) - shape.style.y;
  }
  let antialias = max(fwidth(signedDistance), 0.6 / viewport.ratio);
  var coverage = select(1.0 - smoothstep(-antialias * 0.5, antialias * 0.5, signedDistance), 1.0, kind == 4u);
  var color = shape.color;
  if (kind == 5u || kind == 6u) {
    // Binary geometric coverage: no edge smoothing or stochastic samples.
    // The tiny fixed tolerance only covers f32 roundoff at shared edges.
    coverage = select(0.0, 1.0, signedDistance <= 0.001);
    let sampled = textureSampleGrad(materialImage, materialSampler, uv, uvDx, uvDy);
    color = vec4f(sampled.rgb * material.tint.rgb, color.a);
  }
  if (kind == 1u) {
    let interior = 1.0 - smoothstep(-antialias * 0.5, antialias * 0.5, radial + shape.style.y);
    color = mix(shape.color, shape.fill, interior);
  }
  if (any(pixel < shape.bounds.xy) || any(pixel > shape.bounds.xy + shape.bounds.zw)) { discard; }
  if (kind == 4u && any(pixel >= shape.bounds.xy + shape.bounds.zw)) { discard; }
  return vec4f(color.rgb, color.a * coverage);
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return shade(input);
}
@fragment fn fragmentUnion(input: VertexOutput) -> @location(0) vec4f {
  let color = shade(input);
  return vec4f(color.rgb * color.a, color.a);
}
`;

const compositeShader = `
@group(0) @binding(0) var image: texture_2d<f32>;
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[vertex], 0, 1);
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  return textureLoad(image, vec2i(pixel.xy), 0);
}
`;

export class GeometryRenderer {
  static async create(canvas, onError, onChange) {
    if (!navigator.gpu) throw new LocalizedError('error.webgpuUnavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new LocalizedError('error.webgpuAdapter');
    const renderer = new GeometryRenderer(canvas, await adapter.requestDevice(), onError, onChange);
    await renderer.initialize();
    return renderer;
  }

  constructor(canvas, device, onError, onChange) {
    this.canvas = canvas;
    this.device = device;
    this.context = canvas.getContext('webgpu');
    if (!this.context) throw new LocalizedError('error.webgpuCanvas');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.batches = [];
    this.materialBindings = [];
    this.textures = new PhysicsTextureCache(device, onChange);
    this.lost = false;
    device.lost.then(info => {
      this.lost = true;
      onError(new LocalizedError('error.deviceLost', { reason: info.message || info.reason }));
    });
    device.addEventListener('uncapturederror', event => onError(new LocalizedError('error.webgpu', { message: event.error.message })));
  }

  async initialize() {
    const module = this.device.createShaderModule({ label: 'Geometry SDF', code: shader });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) throw new Error(errors.map(error => `${error.lineNum}: ${error.message}`).join('\n'));
    const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const bindings = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility, buffer: { type: 'uniform' } },
      { binding: 1, visibility, buffer: { type: 'read-only-storage' } },
    ] });
    this.materialLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ] });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [bindings, this.materialLayout] });
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout,
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: sampleCount },
    });
    this.unionPipeline = await this.device.createRenderPipelineAsync({
      layout,
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentUnion', targets: [{ format: this.format, blend: {
        color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
        alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
      } }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: sampleCount },
    });
    const composite = this.device.createShaderModule({ code: compositeShader });
    this.compositePipeline = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: composite, entryPoint: 'vertexMain' },
      fragment: { module: composite, entryPoint: 'fragmentMain', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: sampleCount },
    });
    this.uniform = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.materialSampler = this.device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
    await this.textures.initialize();
    this.emptyMaterial = this.materialBinding(0, { origin: { x: 0, y: 0 }, angle: 0, tileSize: 1, tint: [1, 1, 1, 1] });
  }

  materialBinding(index, material) {
    const texture = this.textures.get(material);
    let entry = this.materialBindings[index];
    if (!entry) {
      entry = { uniform: this.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) };
      this.materialBindings[index] = entry;
    }
    if (entry.texture !== texture) {
      entry.texture = texture;
      entry.bindGroup = this.device.createBindGroup({ layout: this.materialLayout, entries: [
        { binding: 0, resource: { buffer: entry.uniform } }, { binding: 1, resource: this.materialSampler }, { binding: 2, resource: texture.view },
      ] });
    }
    // Every body/trace gets a distinct uniform buffer: multiple writes to one
    // buffer before submission would make all bodies share the final transform.
    this.device.queue.writeBuffer(entry.uniform, 0, new Float32Array([material.origin.x, material.origin.y, material.angle, material.tileSize, ...material.tint]));
    return entry.bindGroup;
  }

  resize(width, height, ratio) {
    const maximum = this.device.limits.maxTextureDimension2D;
    this.ratio = Math.min(ratio, maximum / Math.max(width, 1), maximum / Math.max(height, 1));
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * this.ratio));
    this.canvas.height = Math.max(1, Math.round(height * this.ratio));
    this.multisampleTexture?.destroy();
    this.unionMultisampleTexture?.destroy();
    this.unionTexture?.destroy();
    const multisampleAttachment = {
      size: [this.canvas.width, this.canvas.height], format: this.format,
      sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    };
    this.multisampleTexture = this.device.createTexture(multisampleAttachment);
    this.multisampleView = this.multisampleTexture.createView();
    this.unionMultisampleTexture = this.device.createTexture(multisampleAttachment);
    this.unionMultisampleView = this.unionMultisampleTexture.createView();
    this.unionTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height], format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.unionView = this.unionTexture.createView();
    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.unionView }],
    });
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array([width, height, this.ratio, 0]));
  }

  render(shapes, capture = false, groups = []) {
    if (this.lost || !this.width || !this.height) return null;
    const count = shapes.length / 20;
    const sources = new Set(groups.filter(group => group.material?.type === 'image').map(group => group.material.image));
    this.textures.retain(sources);
    const materials = groups.map((group, index) => group.material ? this.materialBinding(index + 1, group.material) : this.emptyMaterial);
    while (this.materialBindings.length > groups.length + 1) this.materialBindings.pop()?.uniform.destroy();
    const texture = this.context.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    const target = texture.createView();
    const limit = Math.min(this.device.limits.maxStorageBufferBindingSize, this.device.limits.maxBufferSize);
    const batchSize = Math.min(65536, Math.floor(limit / 80));
    let batchIndex = 0;
    for (let offset = 0; offset < count; offset += batchSize) {
      const size = Math.min(batchSize, count - offset);
      const bytes = size * 80;
      let batch = this.batches[batchIndex];
      if (!batch || batch.capacity < bytes) {
        batch?.storage.destroy();
        const capacity = Math.min(limit, Math.max(4096, 2 ** Math.ceil(Math.log2(bytes))));
        const storage = this.device.createBuffer({ size: capacity, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: storage } },
        ] });
        batch = this.batches[batchIndex] = { storage, bindGroup, capacity };
      }
      this.device.queue.writeBuffer(batch.storage, 0, shapes.subarray(offset * 20, (offset + size) * 20));
      batchIndex++;
    }
    while (this.batches.length > batchIndex) this.batches.pop().storage.destroy();
    const drawRange = (pass, start, length, pipeline = this.pipeline, material = this.emptyMaterial) => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(1, material);
      while (length > 0) {
        const index = Math.floor(start / batchSize);
        const first = start % batchSize;
        const size = Math.min(length, batchSize - first);
        pass.setBindGroup(0, this.batches[index].bindGroup);
        pass.draw(3, size, 0, first);
        start += size;
        length -= size;
      }
    };
    const mainPass = loadOp => encoder.beginRenderPass({ colorAttachments: [{
      // Preserve samples across the main passes; resolve for presentation/capture.
      view: this.multisampleView, resolveTarget: target,
      clearValue: rgba(getTheme().canvas.background), loadOp, storeOp: 'store',
    }] });
    let pass = mainPass('clear');
    let cursor = 0;
    for (const [index, group] of groups.entries()) {
      drawRange(pass, cursor, group.start - cursor);
      pass.end();
      const union = encoder.beginRenderPass({ colorAttachments: [{
        view: this.unionMultisampleView, resolveTarget: this.unionView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'discard',
      }] });
      drawRange(union, group.start, group.count, this.unionPipeline, materials[index]);
      union.end();
      pass = mainPass('load');
      pass.setPipeline(this.compositePipeline);
      pass.setBindGroup(0, this.compositeBindGroup);
      pass.draw(3);
      cursor = group.start + group.count;
    }
    drawRange(pass, cursor, count - cursor);
    pass.end();
    const rowBytes = Math.ceil(this.canvas.width * 4 / 256) * 256;
    let readback;
    if (capture) {
      readback = this.device.createBuffer({ size: rowBytes * this.canvas.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: rowBytes }, { width: this.canvas.width, height: this.canvas.height });
    }
    this.device.queue.submit([encoder.finish()]);
    return readback ? this.readPixels(readback, rowBytes, this.canvas.width, this.canvas.height) : null;
  }

  async readPixels(buffer, rowBytes, width, height) {
    try {
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange());
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) pixels.set(mapped.subarray(row * rowBytes, row * rowBytes + width * 4), row * width * 4);
      if (this.format.startsWith('bgra')) {
        for (let index = 0; index < pixels.length; index += 4) [pixels[index], pixels[index + 2]] = [pixels[index + 2], pixels[index]];
      }
      return new ImageData(pixels, width, height);
    } finally { buffer.destroy(); }
  }
}
