// Compact density kernels add before shading: overlapping drops become one
// surface and opacity is applied once, independently of particle count.
const densityShader = /* wgsl */ `
struct Viewport { size: vec2f, ratio: f32, padding: f32 }
struct Shape { bounds: vec4f, geometry: vec4f, style: vec4f, color: vec4f, fill: vec4f }
@group(0) @binding(0) var<uniform> viewport: Viewport;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
struct Output { @builtin(position) position: vec4f, @location(0) @interpolate(flat) index: u32 }
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Output {
  let corners = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let shape = shapes[instance];
  let pixel = shape.bounds.xy + corners[vertex] * shape.bounds.zw;
  var output: Output;
  output.position = vec4f(pixel / viewport.size * vec2f(2,-2) + vec2f(-1,1),0,1);
  output.index = instance;
  return output;
}
@fragment fn fragmentMain(input: Output) -> @location(0) f32 {
  let shape = shapes[input.index];
  let delta = (input.position.xy / viewport.ratio - shape.geometry.xy) / shape.style.z;
  let weight = max(0.0, 1.0 - dot(delta,delta));
  return weight * weight * weight;
}
`;

const surfaceShader = /* wgsl */ `
struct Surface { color: vec4f, halo: vec4f, parameters: vec4f }
@group(0) @binding(0) var density: texture_2d<f32>;
@group(0) @binding(1) var<uniform> surface: Surface;
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(positions[vertex],0,1);
}
@fragment fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let field = textureLoad(density,vec2i(pixel.xy),0).r;
  let threshold = 0.421875;
  let gradient = max(fwidth(field),0.00001);
  let coverage = smoothstep(threshold - gradient*0.5,threshold + gradient*0.5,field);
  let haloCoverage = smoothstep(threshold - gradient*(surface.parameters.x+0.5),threshold - gradient*(surface.parameters.x-0.5),field);
  let alpha = surface.color.a * coverage;
  let haloAlpha = surface.halo.a * haloCoverage * (1.0-alpha);
  return vec4f(surface.color.rgb*alpha + surface.halo.rgb*haloAlpha,alpha+haloAlpha);
}
`;

export class LiquidRenderer {
  constructor(device, format, sampleCount) {
    this.device=device;this.format=format;this.sampleCount=sampleCount;this.bindings=[];
  }
  async initialize(shapeBindings) {
    const device=this.device;
    const density=device.createShaderModule({label:'Liquid density kernels',code:densityShader});
    const surface=device.createShaderModule({label:'Continuous liquid surface',code:surfaceShader});
    for(const module of [density,surface]){
      const errors=(await module.getCompilationInfo()).messages.filter(message=>message.type==='error');
      if(errors.length)throw new Error(errors.map(error=>`${error.lineNum}: ${error.message}`).join('\n'));
    }
    this.densityPipeline=await device.createRenderPipelineAsync({
      layout:device.createPipelineLayout({bindGroupLayouts:[shapeBindings]}),
      vertex:{module:density,entryPoint:'vertexMain'},
      fragment:{module:density,entryPoint:'fragmentMain',targets:[{format:'r16float',blend:{color:{srcFactor:'one',dstFactor:'one'},alpha:{srcFactor:'one',dstFactor:'one'}}}]},
      primitive:{topology:'triangle-list'},multisample:{count:this.sampleCount},
    });
    this.surfacePipeline=await device.createRenderPipelineAsync({
      layout:'auto',vertex:{module:surface,entryPoint:'vertexMain'},
      fragment:{module:surface,entryPoint:'fragmentMain',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},
      primitive:{topology:'triangle-list'},multisample:{count:this.sampleCount},
    });
  }
  resize(width,height) {
    this.width=width;this.height=height;this.texture?.destroy();this.multisample?.destroy();this.texture=null;
    for(const binding of this.bindings)binding.group=null;
  }
  prepare(index, liquid, ratio) {
    const device=this.device;
    if(!this.texture){
      this.texture=device.createTexture({label:'Liquid density',size:[this.width,this.height],format:'r16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
      this.view=this.texture.createView();
      this.multisample=device.createTexture({label:'Liquid density MSAA',size:[this.width,this.height],format:'r16float',sampleCount:this.sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT});
      this.multisampleView=this.multisample.createView();
    }
    let binding=this.bindings[index];
    if(!binding){binding={uniform:device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})};this.bindings[index]=binding;}
    if(!binding.group)binding.group=device.createBindGroup({layout:this.surfacePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.view},{binding:1,resource:{buffer:binding.uniform}}]});
    device.queue.writeBuffer(binding.uniform,0,new Float32Array([...liquid.color,...liquid.halo,3*ratio,0,0,0]));
    return binding.group;
  }
  begin(encoder) {
    return encoder.beginRenderPass({colorAttachments:[{view:this.multisampleView,resolveTarget:this.view,clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'discard'}]});
  }
  retain(count) { while(this.bindings.length>count)this.bindings.pop().uniform.destroy(); }
}
