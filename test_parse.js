const parser = require('@babel/parser');

const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

try {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
      'classProperties',
      'decorators-legacy',
      'objectRestSpread',
      'optionalChaining',
      'nullishCoalescingOperator',
    ],
    createParenthesizedExpressions: true,
  });
  console.log('Parsed successfully!');
  console.log('AST node count:', ast.program.body.length);
} catch (e) {
  console.log('Parse error:', e.message);
  console.log('Location:', e.loc);
}
