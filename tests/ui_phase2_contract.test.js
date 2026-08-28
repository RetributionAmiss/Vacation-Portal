const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'Styles_UI_Phase2.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  index.includes("include('Styles_UI_Phase2')"),
  'AppsScriptIndex.html must load Styles_UI_Phase2.html.'
);

['Meal', 'Item', 'Activity'].forEach((label) => {
  assert(
    styles.includes(`td[data-label=\"${label}\"]`),
    `${label} must have a mobile primary-item selector.`
  );
});

assert(
  styles.includes('order:-20!important'),
  'Primary planner items must be promoted ahead of secondary fields.'
);

assert(
  /\.rental-image\s*\{[\s\S]*?min-height:150px!important/.test(styles),
  'Mobile rental images must use the compact 150px treatment.'
);

assert(
  styles.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),
  'Mobile rental actions must support a compact two-column layout.'
);

assert(
  styles.includes('@media(max-width:360px)'),
  'Very small phones must have a readability fallback.'
);

assert(
  !/\.rental-card\s*\{[^}]*display\s*:\s*none/i.test(styles),
  'Phase 2 must compact rental cards, not hide them.'
);

console.log('PASS UI phase 2 compact card contracts');
