const parser = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Try with exact @babel/preset-env plugins that @nx/react uses
// The @nx/react/babel preset typically includes:
// - @babel/preset-typescript
// - @babel/preset-react
// Let's try with the standard TypeScript + JSX + React plugins

const plugins = [
  // TypeScript
  require.resolve('@babel/plugin-syntax-typescript'),
  // JSX
  require.resolve('@babel/plugin-syntax-jsx'),
  // Other common plugins
  require.resolve('@babel/plugin-proposal-decorators'),
  require.resolve('@babel/plugin-proposal-class-properties'),
  require.resolve('@babel/plugin-proposal-object-rest-spread'),
];

console.log('Trying with @babel plugins...');

try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: [
      '@babel/plugin-syntax-typescript',
      '@babel/plugin-syntax-jsx',
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      '@babel/plugin-proposal-class-properties',
      '@babel/plugin-proposal-object-rest-spread',
    ],
    createParenthesizedExpressions: true,
  });
  console.log('OK with @babel plugins');
} catch (e) {
  console.log('Error with @babel plugins:', e.message);
  console.log('Location:', e.loc);
}

// Try with string plugins
console.log('\nTrying with string plugins...');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: [
      'syntaxTypescript',
      'syntaxJsx',
      'proposalDecorators',
      'proposalClassProperties',
      'proposalObjectRestSpread',
    ],
    createParenthesizedExpressions: true,
  });
  console.log('OK with string plugins');
} catch (e) {
  console.log('Error with string plugins:', e.message);
  console.log('Location:', e.loc);
}

// Check what @babel/parser calls the TypeScript plugin
console.log('\nTrying with typescript plugin name...');
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
