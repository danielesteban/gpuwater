import FastNoise from 'fastnoise-lite';

export const Noise = (device, size) => {
  const buffer = device.createBuffer({
    size: size * size * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  const data = new Float32Array(buffer.getMappedRange());
  for (let i = 0, l = data.length; i < l; i++) {
    data[i] = Math.random();
  }
  buffer.unmap();
  return buffer;
};

export const Uniform = (device, data) => ({
  buffer: device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  }),
  data,
  set(value) {
    this.data.set(value);
    device.queue.writeBuffer(this.buffer, 0, this.data);
  },
});

export const World = (device, width, height) => {
  const buffer = device.createBuffer({
    size: width * height * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  const data = new Float32Array(buffer.getMappedRange());
  const noise = new FastNoise();
  noise.SetSeed(Math.floor(Math.random() * 2147483647));
  noise.SetFractalType(FastNoise.FractalType.FBm);
  noise.SetFrequency(0.005);
  for (let j = 0, y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, j++) {
      const n = noise.GetNoise(x, y);
      if (n > 0.1) {
        data[j] = 1 + ((n - 0.1) / 0.9);
      }
    }
  }
  buffer.unmap();
  return buffer;
};
