import { readFileSync, writeFileSync } from "node:fs";

// Invoked by the `version` lifecycle script in package.json after
// `npm version <type>` bumps package.json. Mirrors the version into
// manifest.json and adds a row to versions.json mapping the new
// plugin version → the current minAppVersion.

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error("npm_package_version is not set; run via `npm version`.");
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`Bumped manifest.json and versions.json to ${targetVersion} (minAppVersion ${minAppVersion}).`);
