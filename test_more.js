const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Try with Flow plugin
console.log('Trying with flow plugin...');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'flow'],
  });
  console.log('OK with flow');
} catch (e) {
  console.log('Error with flow:', e.message);
}

// Try with explicit importSource
console.log('\nTrying with importSource...');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    jsx: 'react',
  });
  console.log('OK with jsx:react');
} catch (e) {
  console.log('Error with jsx:react:', e.message);
}

// Check the line 914 position in the original file
console.log('\nOriginal file analysis:');
console.log('Line 914 char at index 29577:', JSON.stringify(code[29577]));

// What if we remove the return statement entirely and replace with a string?
let lines = code.split('\n');
// Find the return statement
let returnLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('return (')) {
    returnLine = i;
    break;
  }
}
console.log('\nFirst return found at line', returnLine + 1);

// Try a minimal reproduction
console.log('\nTrying minimal reproduction...');
const minimal = `import React from 'react';
const Test = () => {
  return (
    <React.Fragment>
      <div>test</div>
    </React.Fragment>
  );
};
export default Test;
`;
try {
  parser.parse(minimal, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Minimal OK');
} catch (e) {
  console.log('Minimal error:', e.message);
}
