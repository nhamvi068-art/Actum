const fs = require('fs');
const parser = require('@babel/parser');

let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find PlaceholderOverlayInner boundaries
const startIdx = lines.findIndex(l => l.includes('const PlaceholderOverlayInner'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '});');

console.log('Component boundaries:', startIdx + 1, 'to', endIdx + 1);
console.log('Component length:', endIdx - startIdx + 1, 'lines');

// Binary search within the component
let low = startIdx;
let high = endIdx + 1;
let prevError = null;

while (high - low > 1) {
  const mid = Math.floor((low + high) / 2);
  const snippet = lines.slice(0, mid).join('\n');

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

console.log('First failing line:', high);
console.log('Error:', prevError ? prevError.message : 'none');
console.log('\nContext around line', high, ':');
for (let i = Math.max(0, high - 3); i <= Math.min(lines.length - 1, high + 2); i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(lines[i])}`);
}
