// build/create-github-release.js — creates the GitHub Release for the
// current package.json version BEFORE electron-builder ever runs, run as
// its own step in the `release`/`release:minor`/`release:major` npm
// scripts. Not an electron-builder hook (unlike beforePack.js/afterPack.js
// in this same folder) — a standalone script invoked directly.
//
// Why this needs to exist at all: electron-builder's own GitHub publish
// step (`--publish always`) is supposed to create the release itself if one
// doesn't exist yet, and normally does. But with two Windows targets
// (nsis + portable) each producing multiple artifacts (the installer, its
// blockmap, the portable exe), electron-builder fires its own "does a
// release exist for this tag yet?" check per artifact upload, independently
// and concurrently — confirmed in practice (twice) to race: two "create the
// release" calls can both see "not yet" and both proceed, and either the
// loser gets a hard 422 ("Published releases must have a valid tag") that
// kills the whole `electron-builder` process, or — worse, no error at all —
// both "win" and GitHub ends up with TWO separate release objects for the
// same tag, each holding only some of the artifacts (one had `latest.yml` +
// the installer, the other had the portable exe + the blockmap). Either way
// electron-updater never finds a single release with everything it needs.
//
// Removing the ambiguity this races over is simpler than trying to
// serialize electron-builder's own internal upload pipeline: pre-create the
// release here (a single, one-shot, non-racing API call) so that by the
// time electron-builder runs, "does a release exist for this tag" is
// unambiguously yes for every artifact's own upload — nothing left to race
// on. Idempotent: if the release already exists (e.g. a previous attempt
// got this far before failing later), this is a no-op rather than an error.
'use strict';

const https = require('node:https');
const pkg = require('../package.json');

const { owner, repo } = pkg.build.publish;
const version = pkg.version;
const tag = `v${version}`;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.error('create-github-release: no GH_TOKEN/GITHUB_TOKEN in the environment — set one before running npm run release (see CLAUDE.md).');
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'create-github-release-script',
          Accept: 'application/vnd.github+json',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          const parsed = chunks ? JSON.parse(chunks) : null;
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const existing = await request('GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
  if (existing.status === 200) {
    console.log(`create-github-release: release ${tag} already exists (id=${existing.body.id}) — nothing to do.`);
    return;
  }
  if (existing.status !== 404) {
    console.error(`create-github-release: unexpected status ${existing.status} checking for an existing release:`, existing.body);
    process.exit(1);
  }

  const created = await request('POST', `/repos/${owner}/${repo}/releases`, {
    tag_name: tag,
    name: version,
    draft: false,
    prerelease: false,
    generate_release_notes: false,
  });
  if (created.status !== 201) {
    console.error(`create-github-release: failed to create release ${tag} (status ${created.status}):`, created.body);
    process.exit(1);
  }
  console.log(`create-github-release: created release ${tag} (id=${created.body.id}).`);
}

main().catch((err) => {
  console.error('create-github-release: failed:', err);
  process.exit(1);
});
