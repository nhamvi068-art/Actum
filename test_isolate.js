const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');
const lines = code.split('\n');

// Find PlaceholderOverlayInner boundaries
const startIdx = lines.findIndex(l => l.includes('// 加载动画覆盖层组件'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '});');

console.log('Component boundaries:', startIdx + 1, 'to', endIdx + 1);

// Try parsing WITHOUT the component
const without = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
const withoutCode = without.join('\n');

console.log('\nTrying to parse WITHOUT PlaceholderOverlayInner...');
try {
  parser.parse(withoutCode, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK! File parses without PlaceholderOverlayInner.');
} catch (e) {
  console.log('Error even without component:', e.message);
  console.log('Location:', e.loc);
}

// Try parsing JUST the component
const component = lines.slice(startIdx, endIdx + 1).join('\n');
console.log('\nTrying to parse JUST PlaceholderOverlayInner...');
try {
  parser.parse(component, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK! Component parses on its own.');
} catch (e) {
  console.log('Component error:', e.message);
  console.log('Location:', e.loc);
}

// What if we try to parse the component with a wrapper?
const withWrapper = 'const React = require("react");\n' + component;
console.log('\nTrying component with React require...');
try {
  parser.parse(withWrapper, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK with React require!');
} catch (e) {
  console.log('Error with React require:', e.message);
}
