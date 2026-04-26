const fs = require('fs');
const code = fs.readFileSync('G:/Actum/packages/drawnix/src/drawnix.tsx', 'utf-8');

// Extract PlaceholderOverlayInner (lines 548-914)
let lines = code.split('\n');
const component = lines.slice(547, 914).join('\n');

// Try modifying the Fragment and see if it parses
const modified = component.replace(
  'return (\n    <React.Fragment>',
  'return (\n    <React.Fragment key="1">'
);

const parser = require('@babel/parser');
console.log('Trying with React.Fragment key...');
try {
  parser.parse(modified, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK with Fragment key!');
} catch (e) {
  console.log('Error:', e.message);
}

// Try replacing React.Fragment with div wrapper
const modified2 = component.replace(
  'return (\n    <React.Fragment>\n      <div\n        className={`image-placeholder',
  'return (\n    <div\n      className={`image-placeholder'
).replace(
  '        </div>\n      </div>\n    </React.Fragment>\n  );\n});',
  '      </div>\n    </div>\n  );\n});'
);

console.log('\nTrying with div wrapper instead of Fragment...');
try {
  parser.parse(modified2, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK with div wrapper!');
} catch (e) {
  console.log('Error:', e.message);
}

// Try with explicit children prop
const modified3 = component.replace(
  'return (\n    <React.Fragment>',
  'return React.createElement(React.Fragment, null,'
);

console.log('\nTrying with createElement...');
try {
  parser.parse(modified3, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('OK with createElement!');
} catch (e) {
  console.log('Error:', e.message);
}
