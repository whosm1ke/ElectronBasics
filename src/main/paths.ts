// paths.ts — every userData file/directory path Snippet Runner persists to,
// centralized so storage modules never redefine (or drift on) a path.
import path from 'node:path';
import { app } from 'electron';

const USER_DATA = app.getPath('userData');

export const SNIPPETS_FILE = path.join(USER_DATA, 'snippets.json');
export const HISTORY_FILE = path.join(USER_DATA, 'history.json');
export const APP_SETTINGS_FILE = path.join(USER_DATA, 'app-settings.json');
export const VARIABLES_FILE = path.join(USER_DATA, 'variables.json');
export const GROUPS_FILE = path.join(USER_DATA, 'groups.json');
export const PIPELINES_FILE = path.join(USER_DATA, 'pipelines.json');
export const BACKUPS_DIR = path.join(USER_DATA, 'backups');
