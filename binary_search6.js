const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find PlaceholderOverlayInner boundaries
const startIdx = lines.findIndex(l => l.includes('// 加载动画覆盖层组件'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '});');

// Extract just the component
const component = lines.slice(startIdx, endIdx + 1).join('\n');
const compLines = component.split('\n');

console.log('Component has', compLines.length, 'lines');

// Check line 236
console.log('\nLine 236 of component:', JSON.stringify(compLines[235]));

// Let's binary search within the component
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

console.log('\nFirst failing line in component:', high + 1);
console.log('Error:', prevError ? prevError.message : 'none');
console.log('\nContext around line', high + 1, ':');
for (let i = Math.max(0, high - 2); i <= Math.min(compLines.length - 1, high + 2); i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(compLines[i])}`);
}
