const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Binary search: find the exact line where parsing fails
let low = 750;  // Somewhere in the middle of PlaceholderOverlayInner
let high = 915;
let prevError = null;

while (high - low > 1) {
  const mid = Math.floor((low + high) / 2);
  let lineStart = 0;
  let lineNum = 1;
  for (let i = 0; i < code.length && lineNum < mid; i++) {
    if (code[i] === '\n') {
      lineNum++;
      lineStart = i + 1;
    }
  }
  const snippet = code.substring(0, lineStart - 1);

  try {
    parser.parse(snippet, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      createParenthesizedExpressions: true,
    });
    low = mid;
  } catch (e) {
    high = mid;
    prevError = e;
  }
}

console.log('First failing line is around line', high);
console.log('Error:', prevError ? prevError.message : 'none');

// Show the exact failing snippet
let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < high; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}
const snippet = code.substring(lineStart - 100, lineStart + 50);
console.log('\nContext around line', high, ':');
console.log(JSON.stringify(snippet));
