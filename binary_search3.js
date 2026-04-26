const fs = require('fs');
const parser = require('@babel/parser');

let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Extract PlaceholderOverlayInner (lines 548-914)
const component = lines.slice(547, 914).join('\n');
const compLines = component.split('\n');

console.log('Binary searching for exact failing line...');

// Binary search to find the exact failing line
let low = 0;
let high = compLines.length - 1;
let prevError = null;

while (high - low > 1) {
  const mid = Math.floor((low + high) / 2);
  const snippet = compLines.slice(0, mid + 1).join('\n');

  try {
    parser.parse(snippet, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    low = mid;
  } catch (e) {
    high = mid;
    prevError = e;
  }
}

console.log('First failing line in component:', high + 1, '(file line', high + 548, ')');
console.log('Error:', prevError ? prevError.message : 'none');

// Show context
console.log('\nContext around line', high + 1, ':');
for (let i = Math.max(0, high - 2); i <= Math.min(compLines.length - 1, high + 2); i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(compLines[i])}`);
}
