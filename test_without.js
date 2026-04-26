const fs = require('fs');
const parser = require('@babel/parser');

// Read the original file
let code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Find and remove PlaceholderOverlayInner component
const lines = code.split('\n');
const startIdx = lines.findIndex(l => l.includes('const PlaceholderOverlayInner'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '});');

if (startIdx !== -1 && endIdx !== -1) {
  // Remove lines from startIdx to endIdx (inclusive)
  const modifiedLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  const modifiedCode = modifiedLines.join('\n');

  console.log('Trying to parse file WITHOUT PlaceholderOverlayInner...');
  try {
    parser.parse(modifiedCode, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    console.log('SUCCESS! File parses OK without PlaceholderOverlayInner');
  } catch (e) {
    console.log('Error even without PlaceholderOverlayInner:', e.message);
    console.log('Location:', e.loc);
  }

  // Now try with a minimal PlaceholderOverlayInner
  const minimalComponent = `

const PlaceholderOverlayInner: React.FC<{x: number}> = ({ x }) => {
  return (
    <React.Fragment>
      <div>{x}</div>
    </React.Fragment>
  );
};

`;

  const withMinimal = modifiedCode + minimalComponent;
  console.log('\nTrying with minimal PlaceholderOverlayInner...');
  try {
    parser.parse(withMinimal, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    console.log('SUCCESS! Minimal component works');
  } catch (e) {
    console.log('Error with minimal component:', e.message);
    console.log('Location:', e.loc);
  }
} else {
  console.log('Could not find PlaceholderOverlayInner boundaries');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
}
