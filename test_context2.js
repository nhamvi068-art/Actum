const parser = require('@babel/parser');
const fs = require('fs');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Build snippet: first 559 lines plus stub
const snippet = lines.slice(0, 559).join('\n') + '\n}) => null;';

console.log('Trying first 559 lines + stub...');
console.log('Last 5 lines of snippet:');
const snippetLines = snippet.split('\n');
for (let i = snippetLines.length - 6; i < snippetLines.length; i++) {
  console.log(`  ${i + 1}: ${JSON.stringify(snippetLines[i])}`);
}

try {
  parser.parse(snippet, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('\nFirst 559 lines + stub: OK');
} catch (e) {
  console.log('\nFirst 559 lines + stub Error:', e.message);
  console.log('Location:', e.loc);
}

// Now try with line 560
const snippet560 = lines.slice(0, 560).join('\n') + '\n}) => null;';
console.log('\nTrying first 560 lines + stub...');

try {
  parser.parse(snippet560, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('First 560 lines + stub: OK');
} catch (e) {
  console.log('First 560 lines + stub Error:', e.message);
  console.log('Location:', e.loc);
}

// Check what's unique about line 559
console.log('\nLine 559 (index 558):', JSON.stringify(lines[558]));
console.log('Line 560 (index 559):', JSON.stringify(lines[559]));
