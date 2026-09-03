// id.js — one shared id generator so every store's ids look/sort consistently.
'use strict';

function newId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = { newId };
