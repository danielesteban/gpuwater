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
  'AidRXgQXnLfnB9DGXXmQNW5VeSOy5sahCGEWRkPRKw9dz49s4BtR2o6bg0hUhAk8kFGhHckrJRPprsGBXatuggYAAABUeyJvcmlnaW4iOiJodHRwczovL2dwdXdhdGVyLmdhdHVuZXMuY29tOjQ0MyIsImZlYXR1cmUiOiJXZWJHUFUiLCJleHBpcnkiOjE2NjM3MTgzOTl9'
) : (
  'AvyDIV+RJoYs8fn3W6kIrBhWw0te0klraoz04mw/nPb8VTus3w5HCdy+vXqsSzomIH745CT6B5j1naHgWqt/tw8AAABJeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjgwODAiLCJmZWF0dXJlIjoiV2ViR1BVIiwiZXhwaXJ5IjoxNjYzNzE4Mzk5fQ=='
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
          .replace(/__TOKEN__/g, token)
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
