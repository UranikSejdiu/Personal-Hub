const fs = require('node:fs');
const path = require('node:path');
const {
  generateImageAsync,
  generateImageBackgroundAsync,
  compositeImagesAsync,
} = require('@expo/image-utils');

// Keep icon.png as the original artwork. Only derive launcher-safe padding.
const root = path.resolve(__dirname, '..');
const backgroundColor = require('../app.json').expo.android.adaptiveIcon.backgroundColor;

async function main() {
  const foreground = await generateImageAsync({ projectRoot: root }, {
    src: path.join(root, 'assets/icon.png'),
    width: 800,
    height: 800,
    resizeMode: 'contain',
  });
  const background = await generateImageBackgroundAsync({
    width: 1024,
    height: 1024,
    resizeMode: 'contain',
    backgroundColor,
  });
  const adaptive = await compositeImagesAsync({
    foreground: foreground.source,
    background,
    x: 112,
    y: 112,
  });
  fs.writeFileSync(path.join(root, 'assets/adaptive-icon.png'), adaptive);
  console.log('Generated padded Android foreground from assets/icon.png.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
