const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

console.log('File length:', code.length);
console.log('Char at 30490:', JSON.stringify(code.charAt(30490)));
console.log('Char before 30490:', JSON.stringify(code.substring(30480, 30495)));
console.log('Char codes:', Array.from(code.substring(30485, 30495)).map(c => c.charCodeAt(0)));

// Find line 914 start
let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < 914; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}
console.log('\nLine 914 start index:', lineStart);
console.log('Line 914 content:', JSON.stringify(code.substring(lineStart, lineStart + 20)));

// Show context around index 30490
console.log('\nContext around index 30490:');
console.log(JSON.stringify(code.substring(30460, 30520)));

// Line number for index 30490
let line = 1;
for (let i = 0; i < 30490; i++) {
  if (code[i] === '\n') line++;
}
console.log('\nLine number for index 30490:', line);
