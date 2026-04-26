const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Let's extract just the PlaceholderOverlayInner component and see if it parses
let lines = code.split('\n');

// Find PlaceholderOverlayInner
let startLine = -1;
let endLine = -1;
let braceCount = 0;
let inComponent = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('const PlaceholderOverlayInner')) {
    startLine = i;
    inComponent = true;
  }
  if (inComponent) {
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    if (braceCount === 0 && startLine !== -1) {
      endLine = i;
      break;
    }
  }
}

console.log('PlaceholderOverlayInner from line', startLine + 1, 'to', endLine + 1);

const component = lines.slice(startLine, endLine + 1).join('\n');
console.log('\nTrying to parse PlaceholderOverlayInner...');

try {
  parser.parse(component, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Component parsed OK!');
} catch (e) {
  console.log('Component error:', e.message);
  console.log('Location:', e.loc);

  // Let's try the return statement alone
  const returnStart = component.indexOf('return (');
  if (returnStart !== -1) {
    const returnSnippet = component.substring(returnStart);
    console.log('\nTrying just the return statement...');
    console.log('Return snippet:', JSON.stringify(returnSnippet.substring(0, 200)));
    try {
      parser.parse('() => { ' + returnSnippet + ' }', {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });
      console.log('Return snippet OK!');
    } catch (e2) {
      console.log('Return snippet error:', e2.message);
    }
  }
}
