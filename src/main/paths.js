// paths.js — every userData file/directory path Snippet Runner persists to,
// centralized so storage modules never redefine (or drift on) a path.
'use strict';

const path = require('node:path');
const { app } = require('electron');

const USER_DATA = app.getPath('userData');
module.exports = {
  SNIPPETS_FILE: path.join(USER_DATA, 'snippets.json'),
  HISTORY_FILE: path.join(USER_DATA, 'history.json'),
  APP_SETTINGS_FILE: path.join(USER_DATA, 'app-settings.json'),
  VARIABLES_FILE: path.join(USER_DATA, 'variables.json'),
  GROUPS_FILE: path.join(USER_DATA, 'groups.json'),
  PIPELINES_FILE: path.join(USER_DATA, 'pipelines.json'),
  BACKUPS_DIR: path.join(USER_DATA, 'backups'),
};
