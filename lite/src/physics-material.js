export const concreteTextureURL = '/assets/textures/concrete.png';
export const defaultPhysicsMaterial = () => ({ type: 'concrete', image: null, name: '', tileSize: 2 });
export const physicsMaterial = object => ({ ...defaultPhysicsMaterial(), ...object.material });
export const validTextureImage = image => typeof image === 'string' && image.length <= 8 * 1024 * 1024
  && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image);

// Normalize local images into portable, opaque PNGs. Canvas is used only to
// prepare image assets; bodies continue to render entirely through WebGPU.
export async function importTextureImage(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error('texture-file');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/png');
    if (!validTextureImage(image)) throw new Error('texture-image');
    return { image, name: file.name };
  } finally { bitmap.close(); }
}

export class PhysicsTextureCache {
  constructor(device, onChange) {
    this.device = device;
    this.onChange = onChange;
    this.entries = new Map();
  }
  async initialize() {
    const white = this.device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.white = { texture: white, view: white.createView() };
    this.concrete = this.white;
    await this.load(concreteTextureURL);
    this.concrete = this.entries.get(concreteTextureURL)?.view ? this.entries.get(concreteTextureURL) : this.white;
  }
  async load(source) {
    if (this.entries.has(source)) return;
    const entry = { pending: true, texture: null, view: null };
    this.entries.set(source, entry);
    let texture;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error('texture-response');
      const bitmap = await createImageBitmap(await response.blob());
      try {
        if (this.entries.get(source) !== entry) return;
        const factor = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * factor));
        const height = Math.max(1, Math.round(bitmap.height * factor));
        const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
        texture = this.device.createTexture({ size: [width, height], mipLevelCount, format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        for (let level = 0; level < mipLevelCount; level++) {
          const mipWidth = Math.max(1, width >> level), mipHeight = Math.max(1, height >> level);
          if (mipWidth === bitmap.width && mipHeight === bitmap.height) this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, mipLevel: level }, [mipWidth, mipHeight]);
          else {
            const resized = await createImageBitmap(bitmap, { resizeWidth: mipWidth, resizeHeight: mipHeight, resizeQuality: 'high' });
            try { this.device.queue.copyExternalImageToTexture({ source: resized }, { texture, mipLevel: level }, [mipWidth, mipHeight]); } finally { resized.close(); }
          }
        }
        if (this.entries.get(source) !== entry) { texture.destroy(); return; }
        entry.texture = texture; entry.view = texture.createView();
      } finally { bitmap.close(); }
    } catch { texture?.destroy(); entry.failed = true; }
    finally { entry.pending = false; this.onChange?.(); }
  }
  get(material) {
    if (material?.type !== 'image') return this.concrete;
    const source = material.image;
    if (!validTextureImage(source)) return this.concrete;
    if (!this.entries.has(source)) this.load(source);
    const entry = this.entries.get(source);
    return entry?.view ? entry : this.concrete;
  }
  retain(sources) {
    for (const [source, entry] of this.entries) if (source !== concreteTextureURL && !sources.has(source)) {
      entry.texture?.destroy(); this.entries.delete(source);
    }
  }
  destroy() {
    for(const entry of this.entries.values())entry.texture?.destroy();
    this.entries.clear();this.white?.texture.destroy();
  }
}
