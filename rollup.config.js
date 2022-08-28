import fs from 'fs';
import path from 'path';
import copy from 'rollup-plugin-copy';
import html from '@rollup/plugin-html';
import livereload from 'rollup-plugin-livereload';
import postcss from 'rollup-plugin-postcss';
import resolve from '@rollup/plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import { terser } from 'rollup-plugin-terser';

const outputPath = path.resolve(__dirname, 'dist');
const production = !process.env.ROLLUP_WATCH;
const token = production ? (
  'AqSq2Gficj/GZMU52DtFX+nLoG1/MPxS7rDaz1txHiN9ayGmEoP/dp6t5GXsLaOIoj57d7RLJVAruTgcKx4MuQUAAABUeyJvcmlnaW4iOiJodHRwczovL2dwdXdhdGVyLmdhdHVuZXMuY29tOjQ0MyIsImZlYXR1cmUiOiJXZWJHUFUiLCJleHBpcnkiOjE2NzUyMDk1OTl9'
) : (
  'AkoE8+yWvZMfOjxrWIWvq/aMz5KEEkAlww7Bx2CAzx3UG3J1wdvOGTgLm48isIN9VbQbJjo0AKfKDVktsf4q7AoAAABJeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJmZWF0dXJlIjoiV2ViR1BVIiwiZXhwaXJ5IjoxNjc1MjA5NTk5fQ=='
);

export default {
  input: path.join(__dirname, 'src', 'main.js'),
  output: {
    dir: outputPath,
    format: 'iife',
  },
  plugins: [
    resolve({
      browser: true,
    }),
    postcss({
      extract: 'main.css',
      minimize: production,
    }),
    html({
      template: ({ files }) => (
        fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf8')
          .replace('__TOKEN__', token)
          .replace(
            '<link rel="stylesheet">',
            (files.css || [])
              .map(({ fileName }) => `<link rel="stylesheet" href="/${fileName}">`)
              .join('\n')
          )
          .replace(
            '<script></script>',
            (files.js || [])
              .map(({ fileName }) => `<script defer src="/${fileName}"></script>`)
              .join('\n')
          )
      ),
    }),
    copy({
      targets: [{ src: 'screenshot.png', dest: 'dist' }],
    }),
    ...(production ? [
      terser({ format: { comments: false } }),
      {
        writeBundle() {
          fs.writeFileSync(path.join(outputPath, 'CNAME'), 'gpuwater.gatunes.com');
        },
      },
    ] : [
      serve({
        contentBase: outputPath,
        port: 8080,
      }),
      livereload(outputPath),
    ]),
  ],
  watch: { clearScreen: false },
};
