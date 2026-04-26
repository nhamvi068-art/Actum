const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Check for any non-printable characters
let suspicious = [];
for (let i = 0; i < code.length; i++) {
  const charCode = code.charCodeAt(i);
  // Check for unusual whitespace or control characters
  if (charCode === 8203 || charCode === 8204 || charCode === 8205 || // zero-width chars
      (charCode >= 127 && charCode < 160) || // control chars
      charCode === 65535 || charCode === 65534) {
    suspicious.push({ index: i, char: code[i], code: charCode, line: code.substring(0, i).split('\n').length });
  }
}

if (suspicious.length > 0) {
  console.log('Suspicious characters found:', suspicious.slice(0, 20));
} else {
  console.log('No suspicious characters found');
}

// Check around line 914
let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < 914; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}

console.log('\nLine 914 chars:', Array.from(code.substring(lineStart, lineStart + 5)).map(c => c.charCodeAt(0)));
console.log('Line 913-914:', JSON.stringify(code.substring(lineStart - 30, lineStart + 20)));
