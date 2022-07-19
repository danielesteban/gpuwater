import FastNoise from 'fastnoise-lite';
import Rasterizer from './rasterizer.js';

const CellFromPos = `
fn cellFromPos(pos : vec2<i32>) -> u32 {
  return u32(pos.y * __WIDTH__ + pos.x); 
}
`;

const Simulation = `
@binding(0) @group(0) var<uniform> offset : vec2<i32>;
@binding(1) @group(0) var<storage, read> walls : array<f32>;
@binding(2) @group(0) var<storage, read> waterState : array<f32>;
@binding(3) @group(0) var<storage, read_write> waterStep : array<f32>;

${CellFromPos}

const maxMass : f32 = 1.0; // The un-pressurized mass of a full water cell
const maxCompress : f32 = 0.02; // How much excess water a cell can store, compared to the cell above it
fn getStableState(totalMass : f32) -> f32 {
  // This function is used to compute how water should be split among two vertically adjacent cells.
  // It returns the amount of water that should be in the bottom cell.
  if (totalMass <= 1.0) {
    return 1.0;
  }
  if (totalMass < maxMass * 2.0 + maxCompress) {
    return (maxMass * maxMass + totalMass * maxCompress) / (maxMass + maxCompress);
  }
  return (totalMass + maxCompress) / 2.0;
}

const neighbors = array<vec2<i32>, 4>(
  vec2<i32>(0, 1),
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1)
);

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec2<i32> = vec2<i32>(GlobalInvocationID.xy) * 3 + offset;
  var cell : u32 = cellFromPos(pos);
  if (walls[cell] > 0.0) {
    return;
  }
  var mass : f32 = waterState[cell];
  var remainingMass : f32 = mass;
  for (var n : u32 = 0; remainingMass > 0.0 && n < 4; n++) {
    var npos : vec2<i32> = pos + neighbors[n];
    var neighbor : u32 = cellFromPos(npos);
    var edge : bool = npos.x < 0 || npos.x >= __WIDTH__ || npos.y < 0 || npos.y >= __HEIGHT__;
    if (edge || walls[neighbor] == 0.0) {
      var neighborMass : f32 = 0.0;
      if (!edge) {
        neighborMass = waterState[neighbor];
      }
      var flow : f32;
      switch (n) {
        default: { // Left || Right
          // Equalize the amount of water between neighbors
          flow = (mass - neighborMass) / 4.0f;
        }
        case 0: { // Down
          flow = getStableState(remainingMass + neighborMass) - neighborMass;
        }
        case 3: { // Up
          // Only compressed water flows upwards
          flow = remainingMass - getStableState(remainingMass + neighborMass);
        }
      }
      if (flow > 0.1) {
        // Smooth flow
        flow *= 0.5;
      }
      flow = clamp(flow, 0.0, min(1.0, remainingMass));
      waterStep[cell] -= flow;
      if (!edge) {
        waterStep[neighbor] += flow;
      }
      remainingMass -= flow;
    }
  }
}
`;

const Update = `
struct Params {
  pointer : vec2<i32>,
  button : i32,
  size : i32,
};

@binding(0) @group(0) var<uniform> params : Params;
@binding(1) @group(0) var<storage, read_write> walls : array<f32>;
@binding(2) @group(0) var<storage, read_write> waterState : array<f32>;
@binding(3) @group(0) var<storage, read_write> waterStep : array<f32>;

${CellFromPos}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  for (var y : i32 = -params.size; y <= params.size; y++) {
    for (var x : i32 = -params.size; x <= params.size; x++) {
      var pos : vec2<i32> = vec2<i32>(params.pointer.x + x, params.pointer.y + y);
      if (pos.x < 0 || pos.x >= __WIDTH__ || pos.y < 0 || pos.y >= __HEIGHT__ || length(vec2<f32>(f32(x), f32(y))) >= f32(params.size)) {
        continue;
      }
      var cell : u32 = cellFromPos(pos);
      switch (params.button) {
        default: {
          if (walls[cell] == 0) {
            waterState[cell] = 0.5;
            waterStep[cell] = 0.5;
          }
        }
        case 1: {
          walls[cell] = 1;
          waterState[cell] = 0;
          waterStep[cell] = 0;
        }
        case 2: {
          walls[cell] = 0;
          waterState[cell] = 0;
          waterStep[cell] = 0;
        }
      }
    }
  }
}
`;

const Output = `
@binding(0) @group(0) var<storage, read> walls : array<f32>;
@binding(1) @group(0) var<storage, read> water : array<f32>;
@binding(2) @group(0) var color : texture_storage_2d<rgba8unorm, write>;

${CellFromPos}

fn getColor(cell : u32) -> vec3<f32> {
  var v : f32 = walls[cell];
  if (v > 0.0) {
    return vec3<f32>(0.6, 0.4, 0.0) * (0.4 + min(v / 2.0, 0.8));
  }
  v = water[cell];
  if (v > 0.001) {
    return vec3<f32>(0.0, 0.0, 1.0) * (1.0 - min(v / 2.0, 0.8));
  }
  return vec3<f32>(0.0, 0.0, 0.0);
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
  textureStore(color, pos, vec4<f32>(getColor(cellFromPos(pos)), 1.0));
}
`;

class Simulator {
  constructor({ canvas, width, height }) {
    navigator.gpu
      .requestAdapter()
      .then((adapter) => {
        this.adapter = adapter;
        return adapter.requestDevice();
      })
      .then((device) => {
        this.device = device;

        const buffers = Array.from({ length: 3 }, (v, i) => {
          const buffer = device.createBuffer({
            size: width * height * Float32Array.BYTES_PER_ELEMENT,
            usage: (
              (i == 1 ? GPUBufferUsage.COPY_DST : 0)
              | (i === 2 ? GPUBufferUsage.COPY_SRC : 0)
              | GPUBufferUsage.STORAGE
            ),
            mappedAtCreation: i === 0,
          });
          if (i === 0) {
            const noise = new FastNoise();
            noise.SetSeed(Math.floor(Math.random() * 2147483647));
            noise.SetFractalType(FastNoise.FractalType.FBm);
            noise.SetFrequency(0.005);
            const data = new Float32Array(buffer.getMappedRange());
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const n = noise.GetNoise(x, y);
                if (n > 0.1) data[y * width + x] = 0.9 + n;
              }
            }
            buffer.unmap();
          }
          return buffer;
        });

        const simulationPipeline = device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: device.createShaderModule({
              code: Simulation.replace(/__WIDTH__/g, width).replace(/__HEIGHT__/g, height),
            }),
            entryPoint: 'main',
          },
        });
        const simulationUniforms = device.createBuffer({
          size: 2 * Int32Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        this.simulation = {
          bindings: device.createBindGroup({
            layout: simulationPipeline.getBindGroupLayout(0),
            entries: [simulationUniforms, ...buffers].map((buffer, binding) => ({
              binding,
              resource: { buffer },
            })),
          }),
          uniforms: {
            buffer: simulationUniforms,
            data: new Int32Array(2),
          },
          buffers,
          pipeline: simulationPipeline,
          width,
          height,
        };

        const outputPipeline = device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: device.createShaderModule({
              code: Output.replace(/__WIDTH__/g, width).replace(/__HEIGHT__/g, height),
            }),
            entryPoint: 'main',
          },
        });
        const outputTexture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.output = {
          bindings: device.createBindGroup({
            layout: outputPipeline.getBindGroupLayout(0),
            entries: [
              {
                binding: 0,
                resource: {
                  buffer: buffers[0],
                },
              },
              {
                binding: 1,
                resource: {
                  buffer: buffers[1],
                },
              },
              {
                binding: 2,
                resource: outputTexture.createView(),
              },
            ],
          }),
          pipeline: outputPipeline,
          texture: outputTexture,
        };

        const updatePipeline = device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: device.createShaderModule({
              code: Update.replace(/__WIDTH__/g, width).replace(/__HEIGHT__/g, height),
            }),
            entryPoint: 'main',
          },
        });
        const updateUniforms = device.createBuffer({
          size: 4 * Int32Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        this.update = {
          bindings: device.createBindGroup({
            layout: updatePipeline.getBindGroupLayout(0),
            entries: [updateUniforms, ...buffers].map((buffer, binding) => ({
              binding,
              resource: { buffer },
            })),
          }),
          uniforms: {
            buffer: updateUniforms,
            data: new Int32Array(4),
          },
          buffers,
          pipeline: updatePipeline,
        };

        this.rasterizer = new Rasterizer({
          adapter: this.adapter,
          canvas,
          device,
          texture: outputTexture.createView(),
        });

        this.isReady = true;
      });
  }

  tick(iterations, pointer) {
    const { simulation, device, output, rasterizer, update } = this;
  
    if (pointer.button !== -1) {
      update.uniforms.data[0] = Math.floor(pointer.x * simulation.width);
      update.uniforms.data[1] = Math.floor(pointer.y * simulation.height);
      update.uniforms.data[2] = pointer.button;
      update.uniforms.data[3] = pointer.size;
      device.queue.writeBuffer(update.uniforms.buffer, 0, update.uniforms.data);
      const command = device.createCommandEncoder();
      const pass = command.beginComputePass();
      pass.setPipeline(update.pipeline);
      pass.setBindGroup(0, update.bindings);
      pass.dispatchWorkgroups(1);
      pass.end();
      device.queue.submit([command.finish()]);
    }

    for (let i = 0; i < iterations; i++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          simulation.uniforms.data[0] = x;
          simulation.uniforms.data[1] = y;
          device.queue.writeBuffer(simulation.uniforms.buffer, 0, simulation.uniforms.data);
          const command = device.createCommandEncoder();
          const pass = command.beginComputePass();
          pass.setPipeline(simulation.pipeline);
          pass.setBindGroup(0, simulation.bindings);
          pass.dispatchWorkgroups(Math.ceil(simulation.width / 3), Math.ceil(simulation.height / 3));
          pass.end();
          device.queue.submit([command.finish()]);
        }
      }
      const command = device.createCommandEncoder();
      command.copyBufferToBuffer(simulation.buffers[2], 0, simulation.buffers[1], 0, simulation.buffers[2].size);
      device.queue.submit([command.finish()]);
    }

    const command = device.createCommandEncoder();
    {
      const pass = command.beginComputePass();
      pass.setPipeline(output.pipeline);
      pass.setBindGroup(0, output.bindings);
      pass.dispatchWorkgroups(simulation.width, simulation.height);
      pass.end();
    }
    rasterizer.render(command);
    device.queue.submit([command.finish()]);
  }
}

export default Simulator;
