const fs = require('fs');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Find position of line 559 end and line 560 start
let lineStarts = [];
let pos = 0;
lineStarts.push(0);
for (let i = 0; i < code.length; i++) {
  if (code[i] === '\n') {
    lineStarts.push(i + 1);
  }
}

console.log('Line 559 starts at byte:', lineStarts[558]);
console.log('Line 560 starts at byte:', lineStarts[559]);

// Check bytes at boundary
console.log('\nBytes around boundary:');
for (let i = lineStarts[558] - 5; i < lineStarts[560] + 10; i++) {
  const char = code[i] || '(end)';
  const byte = code.charCodeAt(i) || 0;
  console.log(`  ${i}: '${char}' (${byte})`);
}

// Check the last line before the component
console.log('\nLine 547:', JSON.stringify(code.substring(lineStarts[546], lineStarts[547] - 1)));
console.log('Line 548:', JSON.stringify(code.substring(lineStarts[547], lineStarts[548] - 1)));
