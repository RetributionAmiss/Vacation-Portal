const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

assert.ok(fs.existsSync(path.join(root, 'Portal_Index.html')),
  'Portal_Index.html must exist for Apps Script.');
assert.ok(fs.existsSync(path.join(root, 'index.html')),
  'lowercase index.html must exist for GitHub Pages.');
assert.ok(!fs.existsSync(path.join(root, 'Index.html')),
  'Index.html must not exist; it collides with index.html on Windows.');

const app = read('App.gs');
assert.ok(app.includes("HtmlService.createTemplateFromFile('Portal_Index')"),
  'App.gs must render Portal_Index.');

const ignore = read('.claspignore');
[
  '!**/*.gs',
  '!appsscript.json',
  '!Portal_Index.html',
  '!Styles.html',
  '!Client_*.html'
].forEach(pattern => {
  assert.ok(ignore.includes(pattern), '.claspignore missing allowlist entry: ' + pattern);
});

[
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'service-worker.js'
].forEach(name => {
  assert.ok(fs.existsSync(path.join(root, name)), name + ' should remain in the PWA source.');
  assert.ok(!ignore.includes('!' + name),
    name + ' must not be explicitly included in clasp deployment.');
});

console.log('Deployment boundary checks passed.');
