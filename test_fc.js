const parser = require('@babel/parser');

// Test 1: FC type annotation
const test1 = `const PlaceholderOverlayInner: React.FC<PlaceholderOverlayProps> = ({ x }) => { return null; };`;
console.log('Test 1: FC type annotation');
try {
  parser.parse(test1, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test 2: Without type annotation
const test2 = `const PlaceholderOverlayInner = ({ x }) => { return null; };`;
console.log('\nTest 2: Without type annotation');
try {
  parser.parse(test2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test 3: Function declaration with FC type
const test3 = `function PlaceholderOverlayInner(): React.FC<PlaceholderOverlayProps> { return null; }`;
console.log('\nTest 3: Function declaration with FC type');
try {
  parser.parse(test3, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test 4: What the file actually has - let's extract just the first line
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');
const firstLine = lines[547];
console.log('\nTest 4: Actual first line of component');
console.log('  Content:', JSON.stringify(firstLine));

// Check the byte values
console.log('  Byte codes:', Array.from(firstLine).map(c => c.charCodeAt(0)));
