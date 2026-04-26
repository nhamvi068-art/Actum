const parser = require('@babel/parser');

const testCode = `const PlaceholderOverlayInner: React.FC<{x: number}> = ({ x }) => {
  const screenPosition = React.useMemo(() => {
    return { x: 1 };
  }, [x]);
  return <div>{x}</div>;
};`;

console.log('Trying test code...');
try {
  parser.parse(testCode, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK');
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\nTrying without useMemo...');
const testCode2 = `const PlaceholderOverlayInner: React.FC<{x: number}> = ({ x }) => {
  return <div>{x}</div>;
};`;
try {
  parser.parse(testCode2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK');
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\nTrying with function keyword...');
const testCode3 = `const PlaceholderOverlayInner: React.FC<{x: number}> = ({ x }) => {
  const y = () => {
    return 1;
  };
  return <div>{x}</div>;
};`;
try {
  parser.parse(testCode3, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK');
} catch (e) {
  console.log('Error:', e.message);
}
