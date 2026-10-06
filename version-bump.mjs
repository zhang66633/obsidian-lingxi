/* 灵犀 Lingxi 版本号同步脚本：把 manifest.json 的 version 写入 versions.json，
 * 映射到 minAppVersion。来自官方 obsidian-sample-plugin 的同名脚本，
 * 发布前 `npm version patch|minor|major` 会自动调用。 */
import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
	throw new Error("npm_package_version is not set; run via npm version");
}

// read minAppVersion from manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;

// update versions.json with target version and minAppVersion
let versions = {};
try {
	versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch {
	// ignore empty file
}
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
