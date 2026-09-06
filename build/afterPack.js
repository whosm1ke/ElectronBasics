// build/afterPack.js — electron-builder afterPack hook. Strips one file
// from the packaged Chromium/Electron runtime that costs real disk space
// (~20MB) but has zero effect on the app's own functionality: the bundled
// license-attribution HTML page. It's pure legal-notice text, not app
// code — removing it doesn't change what the app does, only how much disk
// it uses once installed. (Locale pruning is handled separately by the
// `electronLanguages` build config, applied by electron-builder itself
// before this hook ever runs.)
'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const licenseFile = path.join(context.appOutDir, 'LICENSES.chromium.html');
  try {
    if (fs.existsSync(licenseFile)) {
      const sizeMb = (fs.statSync(licenseFile).size / (1024 * 1024)).toFixed(1);
      fs.unlinkSync(licenseFile);
      console.log(`afterPack: removed LICENSES.chromium.html (${sizeMb} MB, license text only)`);
    }
  } catch (err) {
    console.error('afterPack: failed to remove LICENSES.chromium.html:', err);
  }
};
