const parser = require('@babel/parser');
const fs = require('fs');

// Read the file directly
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Extract the component definition line
const lines = code.split('\n');
const firstLine = lines[547];
console.log('First line:', JSON.stringify(firstLine));

// Try parsing the first line with some context
const snippet = firstLine + '\n  x,\n}) => null;';
console.log('\nSnippet:', JSON.stringify(snippet));

try {
  parser.parse(snippet, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Snippet OK');
} catch (e) {
  console.log('Snippet Error:', e.message);
}

// Try parsing the first 550 lines
const first550 = lines.slice(0, 549).join('\n') + '\n}) => null;';
console.log('\nTrying first 550 lines + stub...');
try {
  parser.parse(first550, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('First 550 OK');
} catch (e) {
  console.log('First 550 Error:', e.message);
  console.log('Location:', e.loc);
}

// What if the file has a BOM or something?
const codeRaw = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx');
console.log('\nFirst 10 bytes:', codeRaw.slice(0, 10));
