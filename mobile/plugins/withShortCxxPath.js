// Expo config plugin: keep the app module's CMake staging directory short on Windows so
// native build paths stay under the 260-character limit. Uses "<project drive>:/x"
// (e.g. D:/x) unless a `dir` option is given. No-op on macOS/Linux.
const path = require('path');
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// [withShortCxxPath]';

module.exports = function withShortCxxPath(config, { dir } = {}) {
  return withAppBuildGradle(config, (c) => {
    if (process.platform !== 'win32' || c.modResults.contents.includes(MARK)) return c;
    const drive = path.parse(c.modRequest.projectRoot).root.replace(/\\$/, '/'); // "D:/"
    const staging = dir || `${drive}x`;
    c.modResults.contents = c.modResults.contents.replace(
      /(\n\s*namespace\s+['"][^'"]+['"]\s*\n)/,
      `$1    ${MARK}\n    externalNativeBuild { cmake { buildStagingDirectory "${staging}" } }\n`,
    );
    return c;
  });
};
