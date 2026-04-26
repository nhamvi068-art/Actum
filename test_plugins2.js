const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// The NX workspace uses @babel/preset-typescript and @babel/preset-react
// These map to 'typescript' and 'jsx' in @babel/parser

console.log('Trying with typescript + jsx...');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK with typescript+jsx');
} catch (e) {
  console.log('Error:', e.message);
  console.log('Location:', e.loc);
}

// Try with @babel/preset-react's jsx plugin config
console.log('\nTrying with typescript + jsx + classProperties...');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'classProperties'],
  });
  console.log('OK with typescript+jsx+classProperties');
} catch (e) {
  console.log('Error:', e.message);
  console.log('Location:', e.loc);
}

// Check if the NX babel preset uses @babel/preset-typescript
// which enables the 'typescript' plugin in @babel/parser

// Let's check what version of @babel/parser we have
console.log('\nBabel parser version:', require('@babel/parser/package.json').version);
