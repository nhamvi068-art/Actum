const parser = require('@babel/parser');
const fs = require('fs');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Build snippet: first 559 lines
const snippet559 = lines.slice(0, 559).join('\n');
console.log('Trying first 559 lines...');

try {
  parser.parse(snippet559, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('First 559 lines: OK');
} catch (e) {
  console.log('First 559 lines Error:', e.message);
  console.log('Location:', e.loc);
}

// Build snippet: first 560 lines
const snippet560 = lines.slice(0, 560).join('\n');
console.log('\nTrying first 560 lines...');

try {
  parser.parse(snippet560, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('First 560 lines: OK');
} catch (e) {
  console.log('First 560 lines Error:', e.message);
  console.log('Location:', e.loc);
}

// Check last 3 lines of 559
console.log('\nLast 3 lines of snippet559:');
const lines559 = snippet559.split('\n');
for (let i = lines559.length - 4; i < lines559.length; i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(lines559[i])}`);
}
