import { Noise, Uniforms, World } from './buffers.js';

const CellFromPos = `
fn cellFromPos(pos : vec2<i32>) -> u32 {
  return u32(pos.y * __WIDTH__ + pos.x); 
}
`;

const Simulation = `
@binding(0) @group(0) var<uniform> offset : vec2<i32>;
@binding(1) @group(0) var<storage, read> world : array<f32>;
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
  vec2<i32>(0, -1),
);

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec2<i32> = vec2<i32>(GlobalInvocationID.xy) * 3 + offset;
  if (pos.x >= __WIDTH__ || pos.y >= __HEIGHT__) {
    return;
  }
  var cell : u32 = cellFromPos(pos);
  if (world[cell] > 0.0) {
    return;
  }
  var mass : f32 = waterState[cell];
  var remainingMass : f32 = mass;
  for (var n : u32 = 0; remainingMass > 0.0 && n < 4; n++) {
    var npos : vec2<i32> = pos + neighbors[n];
    var neighbor : u32 = cellFromPos(npos);
    var edge : bool = npos.x < 0 || npos.x >= __WIDTH__ || npos.y < 0 || npos.y >= __HEIGHT__;
    if (edge || world[neighbor] == 0.0) {
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
@binding(1) @group(0) var<storage, read_write> world : array<f32>;
@binding(2) @group(0) var<storage, read_write> waterState : array<f32>;
@binding(3) @group(0) var<storage, read_write> waterStep : array<f32>;

${CellFromPos}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  for (var y : i32 = -params.size; y <= params.size; y++) {
    for (var x : i32 = -params.size; x <= params.size; x++) {
      var pos : vec2<i32> = vec2<i32>(params.pointer.x + x, params.pointer.y + y);
      if (
        pos.x < 0 || pos.x >= __WIDTH__ || pos.y < 0 || pos.y >= __HEIGHT__
        || length(vec2<f32>(f32(x), f32(y))) >= f32(params.size)
      ) {
        continue;
      }
      var cell : u32 = cellFromPos(pos);
      switch (params.button) {
        default: {
          if (world[cell] == 0) {
            waterState[cell] = 0.5;
            waterStep[cell] = 0.5;
          }
        }
        case 1: {
          world[cell] = 1;
          waterState[cell] = 0;
          waterStep[cell] = 0;
        }
        case 2: {
          world[cell] = 0;
          waterState[cell] = 0;
          waterStep[cell] = 0;
        }
      }
    }
  }
}
`;

const Output = `
@binding(0) @group(0) var<storage, read> world : array<f32>;
@binding(1) @group(0) var<storage, read> water : array<f32>;
@binding(2) @group(0) var<storage, read> noise : array<f32>;
@binding(3) @group(0) var color : texture_storage_2d<rgba8unorm, write>;

${CellFromPos}

fn getDither(pos : vec2<i32>, granularity : f32) -> f32 {
  return mix(
    -granularity,
    granularity,
    noise[u32((pos.y % __NOISE_SIZE__) * __NOISE_SIZE__ + (pos.x % __NOISE_SIZE__))]
  );
}

fn getColor(pos : vec2<i32>) -> vec3<f32> {
  var cell : u32 = cellFromPos(pos);
  var value : f32 = world[cell];
  if (value > 0.0) {
    return (vec3<f32>(0.6, 0.4, 0.0) + getDither(pos, 0.03)) * (0.4 + min(value / 2.0, 0.8));
  }
  value = water[cell];
  if (value > 0.001) {
    return ((vec3<f32>(0.0, 0.0, 1.0) + getDither(pos, 0.06)) * (1.0 - min(value / 2.0, 0.8)));
  }
  return vec3<f32>(0.0, 0.0, 0.0);
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
  textureStore(color, pos, vec4<f32>(getColor(pos), 1.0));
}
`;

class Simulator {
  constructor({ device, width, height }) {
    this.device = device;

    const buffers = [
      World(device, width, height),
      ...Array.from({ length: 2 }, (v, i) => device.createBuffer({
        size: width * height * Float32Array.BYTES_PER_ELEMENT,
        usage: (
          (i === 0 ? GPUBufferUsage.COPY_DST : GPUBufferUsage.COPY_SRC)
          | GPUBufferUsage.STORAGE
        ),
      })),
    ];

    const simulationPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          code: Simulation.replace(/__WIDTH__/g, width).replace(/__HEIGHT__/g, height),
        }),
        entryPoint: 'main',
      },
    });
    const simulationUniforms = Uniforms(device, new Int32Array(2));
    this.simulation = {
      bindings: device.createBindGroup({
        layout: simulationPipeline.getBindGroupLayout(0),
        entries: [simulationUniforms.buffer, ...buffers].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
      buffers,
      pipeline: simulationPipeline,
      uniforms: simulationUniforms,
      width,
      height,
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
    const updateUniforms = Uniforms(device, new Int32Array(4)); 
    this.update = {
      bindings: device.createBindGroup({
        layout: updatePipeline.getBindGroupLayout(0),
        entries: [updateUniforms.buffer, ...buffers].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
      pipeline: updatePipeline,
      uniforms: updateUniforms,
    };

    const outputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          code: Output
            .replace(/__WIDTH__/g, width)
            .replace(/__HEIGHT__/g, height)
            .replace(/__NOISE_SIZE__/g, 256),
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
            resource: {
              buffer: Noise(device, 256),
            },
          },
          {
            binding: 3,
            resource: outputTexture.createView(),
          },
        ],
      }),
      pipeline: outputPipeline,
      texture: outputTexture,
    };
  }

  tick(iterations, pointer) {
    const { simulation, device, output, update } = this;
  
    if (pointer.button !== -1) {
      update.uniforms.set([
        Math.floor(pointer.x * simulation.width),
        Math.floor(pointer.y * simulation.height),
        pointer.button,
        pointer.size,
      ]);
      const command = device.createCommandEncoder();
      const pass = command.beginComputePass();
      pass.setPipeline(update.pipeline);
      pass.setBindGroup(0, update.bindings);
      pass.dispatchWorkgroups(1);
      pass.end();
      device.queue.submit([command.finish()]);
    }

    for (let i = 0; i < iterations; i++) {
      // Each water cell can flow into it's 4 adjacent neighbors.
      // The simulation runs in parallel and can't accumulate flow from different neighbors in the same cell.
      // This runs 9 passes that only update every third cell (+ the pass offset)
      // to ensure each neighbor only receives flow from a single cell.
      // First pass
      //   0                 1
      // [ ->] [·  ] [  ·] [<->] [·  ]
      // Second pass
      //         0                 1
      // [   ] [ ->] [·  ] [  ·] [<- ]
      // Third pass
      //               0                 1
      // [   ] [  ·] [<->] [·  ] [  ·] [<- ]
      // The same happens vertically
      // First pass
      // 0 [\./]
      //   [ · ]
      //   [ · ]
      // 1 [/·\]
      //   [   ]
      // Second pass
      //   [   ]
      // 0 [\./]
      //   [ · ]
      //   [ · ]
      // 1 [/·\]
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          simulation.uniforms.set([x, y]);
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
      command.copyBufferToBuffer(
        simulation.buffers[2], 0,
        simulation.buffers[1], 0,
        simulation.buffers[1].size
      );
      device.queue.submit([command.finish()]);
    }

    {
      const command = device.createCommandEncoder();
      const pass = command.beginComputePass();
      pass.setPipeline(output.pipeline);
      pass.setBindGroup(0, output.bindings);
      pass.dispatchWorkgroups(simulation.width, simulation.height);
      pass.end();
      device.queue.submit([command.finish()]);
    }
  }
}

export default Simulator;
