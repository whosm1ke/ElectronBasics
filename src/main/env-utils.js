// env-utils.js — converts a snippet's ordered {key,value} env list (the shape
// the editor UI and storage use) into a plain object (the shape execFile's
// `env` option and Object spread want). Shared by ipc.js and scheduler.js.
'use strict';

function envListToObject(envList) {
  if (!Array.isArray(envList)) return null;
  const obj = {};
  envList.forEach(({ key, value }) => { if (key) obj[key] = value ?? ''; });
  return Object.keys(obj).length ? obj : null;
}

module.exports = { envListToObject };
