import './main.css';
import Simulator from './simulator.js';
import Rasterizer from './rasterizer.js';

const SIMULATION_WIDTH = 1024;
const SIMULATION_HEIGHT = 768;

const canvas = document.createElement('canvas');
document.getElementById('renderer').appendChild(canvas);

let bounds;
const resize = () => {
  let width = window.innerWidth;
  let height = window.innerHeight;
  if (SIMULATION_WIDTH / SIMULATION_HEIGHT > width / height) {
    height = SIMULATION_HEIGHT * width / SIMULATION_WIDTH;
  } else {
    width = SIMULATION_WIDTH * height / SIMULATION_HEIGHT;
  }
  canvas.width = width;
  canvas.height = height;
  bounds = canvas.getBoundingClientRect();
};
window.addEventListener('resize', resize, false);
resize();

const pointer = { button: -1, size: 10, x: 0, y: 0 };
window.addEventListener('contextmenu', (e) => e.preventDefault(), false);
window.addEventListener('mousemove', ({ clientX, clientY }) => {
  pointer.x = (clientX - bounds.x) / bounds.width;
  pointer.y = (clientY - bounds.y) / bounds.height;
}, false);
window.addEventListener('mousedown', ({ button }) => {
  pointer.button = button;
}, false);
window.addEventListener('mouseup', ({ button }) => {
  if (pointer.button === button) {
    pointer.button = -1;
  }
}, false);

if (navigator.gpu && navigator.gpu.getPreferredCanvasFormat) {
  (async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const simulator = new Simulator({
      device,
      width: SIMULATION_WIDTH,
      height: SIMULATION_HEIGHT,
    });
    const rasterizer = new Rasterizer({
      canvas,
      device,
      format: navigator.gpu.getPreferredCanvasFormat(adapter),
      texture: simulator.output.texture.createView(),
    });

    let clock = performance.now() / 1000;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        clock = performance.now() / 1000;
      }
    }, false);

    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now() / 1000;
      const delta = now - clock;
      clock = now;
      simulator.tick(Math.min(Math.max(Math.floor(delta / (1 / 600)), 1), 10), pointer);
      rasterizer.render();
    };
    requestAnimationFrame(animate);
  })();
} else {
  document.getElementById('canary').classList.add('enabled');
}
