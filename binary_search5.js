const parser = require('@babel/parser');
const fs = require('fs');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find PlaceholderOverlayInner boundaries
const startIdx = 547; // 0-indexed line 548

// Binary search
let low = startIdx;
let high = lines.length;
let prevError = null;

while (high - low > 1) {
  const mid = Math.floor((low + high) / 2);

  // Build snippet: all lines up to mid, plus a stub to close the component
  const snippet = lines.slice(0, mid).join('\n') + '\n}) => null;';

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
