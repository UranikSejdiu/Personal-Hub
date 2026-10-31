const fs = require('node:fs');
const path = require('node:path');

// React Native's legacy global launcher would otherwise wrap CMake's compiler
// launcher twice. Keep its fallback for local builds without a launcher.
function configure(source) {
  if (source.includes('if(CCACHE_FOUND AND NOT CMAKE_CXX_COMPILER_LAUNCHER)')) return source;
  if (!source.includes('if(CCACHE_FOUND)')) throw new Error('React Native CMake cache integration changed; review the launcher configuration');
  return source.replace('if(CCACHE_FOUND)', 'if(CCACHE_FOUND AND NOT CMAKE_CXX_COMPILER_LAUNCHER)');
}
module.exports = configure;
if (require.main === module) {
  const app = process.argv[2];
  if (!['budget', 'notes', 'tasks', 'dhikr'].includes(app)) throw new Error('Unknown app');
  for (const relative of ['cmake-utils/ReactNative-application.cmake', 'src/main/jni/CMakeLists.txt']) {
    const file = path.resolve(__dirname, '../../../apps', app, 'node_modules/react-native/ReactAndroid', relative);
    fs.writeFileSync(file, configure(fs.readFileSync(file, 'utf8')));
  }
}
