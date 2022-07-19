const Vertex = `
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn main(@location(0) position : vec4<f32>, @location(1) uv : vec2<f32>) -> VertexOutput {
  var out : VertexOutput;
  out.position = position;
  out.uv = uv;
  return out;
}
`;

const Fragment = `
@group(0) @binding(0) var mainSampler : sampler;
@group(0) @binding(1) var mainTexture : texture_2d<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(mainTexture, mainSampler, uv);
}
`;

const Plane = (device) => {
  const buffer = device.createBuffer({
    size: 36 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set([
    -1, -1, 0, 1,   0, 1,
    1, -1, 0, 1,    1, 1,
    1, 1, 0, 1,     1, 0,
    1, 1, 0, 1,     1, 0,
    -1, 1, 0, 1,    0, 0,
    -1, -1, 0, 1,   0, 1,
  ]);
  buffer.unmap();
  return { buffer, count: 6 };
};

class Rasterizer {
  constructor({ canvas, device, format, texture }) {
    this.device = device;
    this.context = canvas.getContext('webgpu');
    this.context.configure({ alphaMode: 'opaque', device, format });
    this.geometry = Plane(device);
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: Vertex,
        }),
        entryPoint: 'main',
        buffers: [{
          arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x4',
            },
            {
              shaderLocation: 1,
              offset: 4 * Float32Array.BYTES_PER_ELEMENT,
              format: 'float32x2',
            },
          ],
        }],
      },
      fragment: {
        module: device.createShaderModule({
          code: Fragment,
        }),
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
    this.bindings = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
          }),
        },
        {
          binding: 1,
          resource: texture,
        },
      ],
    });
  }

  render() {
    const { bindings, context, device, geometry, pipeline } = this;
    const command = device.createCommandEncoder();
    const pass = command.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.setVertexBuffer(0, geometry.buffer);
    pass.draw(geometry.count, 1, 0, 0);
    pass.end();
    device.queue.submit([command.finish()]);
  }
}

export default Rasterizer;
