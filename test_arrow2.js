const parser = require('@babel/parser');

// Test: arrow function with destructuring and block body
const test1 = `const Test: React.FC<Props> = ({
  x,
  y,
}) => {
  const z = x;
  return null;
};`;

console.log('Test 1: Arrow with destructuring and block body');
try {
  parser.parse(test1, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test: Same but with interface
const test2 = `interface Props { x: number; y: number; }
const Test: React.FC<Props> = ({
  x,
  y,
}) => {
  const z = x;
  return null;
};`;

console.log('\nTest 2: With interface');
try {
  parser.parse(test2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test: Using generic type
const test3 = `type Props = { x: number; y: number; }
const Test: React.FC<Props> = ({
  x,
  y,
}) => {
  const z = x;
  return null;
};`;

console.log('\nTest 3: With type alias');
try {
  parser.parse(test3, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test: React.FC without generic
const test4 = `const Test = ({
  x,
  y,
}) => {
  const z = x;
  return null;
};`;

console.log('\nTest 4: Without React.FC');
try {
  parser.parse(test4, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}

// Test: Exactly like the component
const test5 = `const PlaceholderOverlayInner: React.FC<PlaceholderOverlayProps> = ({
  placeholder,
  board,
}) => {
  const elementX = placeholder.x;
  return null;
};`;

console.log('\nTest 5: Exactly like PlaceholderOverlayInner');
try {
  parser.parse(test5, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('  OK');
} catch (e) {
  console.log('  Error:', e.message);
}
