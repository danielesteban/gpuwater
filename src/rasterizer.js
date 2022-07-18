const Vertex = `
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) texCoord: vec2<f32>,
}

const plane = array<vec2<f32>, 6>(
  vec2<f32>(1.0, 1.0),
  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(-1.0, 1.0)
);

@vertex
fn main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var vsOut: VertexOutput;
  vsOut.position = vec4<f32>(plane[VertexIndex], 0.0, 1.0);
  vsOut.texCoord = vsOut.position.xy * 0.5 + 0.5;
  vsOut.texCoord.y = 1.0 - vsOut.texCoord.y;
  return vsOut;
}
`;

const Fragment = `
@group(0) @binding(0) var mainSampler: sampler;
@group(0) @binding(1) var mainTexture: texture_2d<f32>;

@fragment
fn main(@location(0) texCoord : vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(mainTexture, mainSampler, texCoord);
}
`;

class Rasterizer {
  constructor({ adapter, canvas, device, texture }) {
    const format = navigator.gpu.getPreferredCanvasFormat(adapter);
    this.context = canvas.getContext('webgpu');
    this.context.configure({ alphaMode: 'opaque', device, format });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: Vertex,
        }),
        entryPoint: 'main',
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

  render(command) {
    const { bindings, context, pipeline } = this;
    const pass = command.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.draw(6, 1, 0, 0);
    pass.end();
  }
}

export default Rasterizer;
