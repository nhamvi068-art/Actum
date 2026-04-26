const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

console.log('Total length:', code.length);
console.log('\nChar at 29577:', JSON.stringify(code[29577]));
console.log('Char code at 29577:', code.charCodeAt(29577));
console.log('Context:', JSON.stringify(code.substring(29550, 29600)));

// Show line 914 with surrounding context
let lines = code.split('\n');
console.log('\nLine 914:', JSON.stringify(lines[913]));
console.log('Line 913:', JSON.stringify(lines[912]));
console.log('Line 912:', JSON.stringify(lines[911]));

// Check if the `});` on line 914 is preceded by any weird characters
console.log('\nLine 913 char codes:', Array.from(lines[912]).map(c => c.charCodeAt(0)));

// Try removing the trailing `;` from line 913 to see if that helps
const modified = lines.slice();
modified[912] = modified[912].replace(/;$/, '');
const modifiedCode = modified.join('\n');

console.log('\nTrying without semicolon on line 913...');
const parser = require('@babel/parser');
try {
  parser.parse(modifiedCode, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK without semicolon!');
} catch (e) {
  console.log('Error:', e.message);
}
