const fs = require('fs');
const parser = require('@babel/parser');

let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find PlaceholderOverlayInner boundaries
const startIdx = lines.findIndex(l => l.includes('const PlaceholderOverlayInner'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '});');

console.log('Component lines:', startIdx + 1, 'to', endIdx + 1);

// Binary search to find the exact failing line
let low = startIdx;
let high = endIdx;
let prevError = null;

while (high - low > 1) {
  const mid = Math.floor((low + high) / 2);
  const snippet = lines.slice(startIdx, mid + 1).join('\n');

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

console.log('First failing line:', high + 1);
console.log('Error:', prevError ? prevError.message : 'none');
console.log('\nContext around line', high + 1, ':');
for (let i = Math.max(0, high - 3); i <= Math.min(lines.length - 1, high + 2); i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(lines[i])}`);
}
