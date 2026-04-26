const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Try parsing first 913 lines
let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < 914; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}
const first914 = code.substring(0, lineStart - 1);

// Try parsing first 913 lines
let lineStart913 = 0;
let lineNum913 = 1;
for (let i = 0; i < code.length && lineNum913 < 913; i++) {
  if (code[i] === '\n') {
    lineNum913++;
    lineStart913 = i + 1;
  }
}
const first913 = code.substring(0, lineStart913 - 1);

console.log('Trying to parse first 913 lines...');
try {
  parser.parse(first913, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    createParenthesizedExpressions: true,
  });
  console.log('First 913 lines parsed OK');
} catch (e) {
  console.log('First 913 lines error:', e.message);
}

console.log('\nTrying to parse first 914 lines...');
try {
  parser.parse(first914, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    createParenthesizedExpressions: true,
  });
  console.log('First 914 lines parsed OK');
} catch (e) {
  console.log('First 914 lines error:', e.message);
  console.log('Location:', e.loc);
}

// Try with more plugins
console.log('\nTrying with more plugins...');
try {
  parser.parse(first914, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
      'classProperties',
      'decorators-legacy',
      'objectRestSpread',
      'optionalChaining',
      'nullishCoalescingOperator',
    ],
    createParenthesizedExpressions: true,
  });
  console.log('First 914 lines parsed OK with more plugins');
} catch (e) {
  console.log('First 914 lines error with more plugins:', e.message);
}
