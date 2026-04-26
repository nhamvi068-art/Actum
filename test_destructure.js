const parser = require('@babel/parser');

// Try parsing just the destructuring pattern
const snippet1 = `({
  placeholder,
  board,
  viewportZoom,
})`;

const snippet2 = `const x = ({
  placeholder,
})`;

const snippet3 = `function test({
  placeholder,
}) {}`;

const snippet4 = `const PlaceholderOverlayInner = ({
  placeholder,
}) => {}`;

console.log('Trying snippet1 (arrow with object destructuring)...');
try {
  parser.parse(snippet1, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Snippet1 OK');
} catch (e) {
  console.log('Snippet1 error:', e.message);
}

console.log('\nTrying snippet2 (const with object destructuring)...');
try {
  parser.parse(snippet2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Snippet2 OK');
} catch (e) {
  console.log('Snippet2 error:', e.message);
}

console.log('\nTrying snippet3 (function with destructuring)...');
try {
  parser.parse(snippet3, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Snippet3 OK');
} catch (e) {
  console.log('Snippet3 error:', e.message);
}

console.log('\nTrying snippet4 (arrow function with destructuring)...');
try {
  parser.parse(snippet4, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Snippet4 OK');
} catch (e) {
  console.log('Snippet4 error:', e.message);
}
