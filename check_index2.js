const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

console.log('File length:', code.length);

// Show context around index 29577
console.log('\nContext around index 29577:');
console.log(JSON.stringify(code.substring(29560, 29600)));

// Line number for index 29577
let line = 1;
for (let i = 0; i < 29577; i++) {
  if (code[i] === '\n') line++;
}
console.log('\nLine number for index 29577:', line);

// Line 914 content
let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < 914; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}
console.log('\nLine 914 content:', JSON.stringify(code.substring(lineStart, lineStart + 20)));

// Check: is there something weird in the JSX that's confusing Babel?
// Let's check what's before line 914
let prevLineStart = 0;
let prevLineNum = 1;
for (let i = 0; i < code.length && prevLineNum < 913; i++) {
  if (code[i] === '\n') {
    prevLineNum++;
    prevLineStart = i + 1;
  }
}
console.log('\nLine 913 content:', JSON.stringify(code.substring(prevLineStart, prevLineStart + 50)));
