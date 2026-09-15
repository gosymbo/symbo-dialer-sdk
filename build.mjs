// Builds the script-tag bundle. The npm package itself ships plain ESM from
// src/ — this exists only so a page that isn't using a bundler can drop in a
// <script> tag and get window.SymboDialer.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.js'],
  outfile: 'dist/symbo-dialer.min.js',
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'SymboDialer',
  target: ['es2020'],
  footer: {
    // esbuild binds the module *namespace* to the global name, so without this
    // a script-tag caller would have to write SymboDialer.SymboDialer.mount().
    // Flatten the namespace onto the default export: the global becomes the
    // SymboDialer object itself, with the named exports hanging off it.
    js: 'SymboDialer=Object.assign(SymboDialer.default,SymboDialer);',
  },
})

console.log('built dist/symbo-dialer.min.js')
