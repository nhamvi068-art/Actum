const parser = require('@babel/parser');

// Try parsing just the return statement
const snippet = `
return (
  <React.Fragment>
    <div>test</div>
  </React.Fragment>
);
`;

const snippet2 = `
const PlaceholderOverlayInner = () => {
  return (
    <React.Fragment>
      <div>test</div>
    </React.Fragment>
  );
};
`;

try {
  parser.parse(snippet, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    createParenthesizedExpressions: true,
  });
  console.log('Snippet 1 OK');
} catch (e) {
  console.log('Snippet 1 error:', e.message);
}

try {
  parser.parse(snippet2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    createParenthesizedExpressions: true,
  });
  console.log('Snippet 2 OK');
} catch (e) {
  console.log('Snippet 2 error:', e.message);
}

// Now let's check the actual first 913 lines more carefully
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

let lineStart = 0;
let lineNum = 1;
for (let i = 0; i < code.length && lineNum < 913; i++) {
  if (code[i] === '\n') {
    lineNum++;
    lineStart = i + 1;
  }
}
const first913 = code.substring(0, lineStart - 1);

console.log('\nLast 100 chars of first 913 lines:');
console.log(JSON.stringify(first913.slice(-100)));
