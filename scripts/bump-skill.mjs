#!/usr/bin/env node
/**
 * Skill Version Control & Hash Sync Tool for `npx skills` (skills.sh)
 *
 * Why this exists:
 * 1. `npx skills check` / `npx skills update` tracks remote GitHub tree hashes (`skillFolderHash`)
 *    and `SKILL.md` frontmatter (`version` & `metadata.version`).
 * 2. If you edit `references/` or `examples/` without updating `SKILL.md` or pushing to GitHub,
 *    clients that cache `SKILL.md` or check frontmatter versions won't detect the update.
 *
 * Usage:
 *   node scripts/bump-skill.mjs list                        # List all skills, versions, and dirty state
 *   node scripts/bump-skill.mjs sync [patch|minor|major]    # Auto-bump any skill whose files changed
 *   node scripts/bump-skill.mjs bump <skill> [patch|minor|major|x.y.z]
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const VERSIONS_FILE = join(ROOT_DIR, "versions.json");
const IGNORED_DIRS = new Set([".git", ".vscode", ".github", "node_modules", "scripts"]);

/**
 * Computes a deterministic SHA-256 hash of all files inside a skill directory,
 * normalized so we can detect whether any file in `<skill>/` changed.
 */
function computeSkillContentHash(skillDir, ignoreSkillMdVersionLine = false) {
  const hash = createHash("sha256");

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = relative(skillDir, fullPath).replace(/\\/g, "/");
        let content = readFileSync(fullPath, "utf8");
        if (ignoreSkillMdVersionLine && relPath === "SKILL.md") {
          content = content
            .replace(/^version:\s*.*$/m, "")
            .replace(/^\s*version:\s*.*$/m, "")
            .replace(/^\s*updated:\s*.*$/m, "");
        }
        hash.update(`file:${relPath}\n${content}\n`);
      }
    }
  }

  walk(skillDir);
  return hash.digest("hex").slice(0, 16);
}

function discoverSkills() {
  const entries = readdirSync(ROOT_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }
    const skillDir = join(ROOT_DIR, entry.name);
    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath) || !statSync(skillMdPath).isFile()) {
      continue;
    }

    const md = readFileSync(skillMdPath, "utf8");
    const versionMatch = md.match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
    const updatedMatch = md.match(/^\s*updated:\s*["']?([^"'\r\n]+)["']?/m);

    skills.push({
      name: entry.name,
      dir: skillDir,
      skillMdPath,
      version: versionMatch ? versionMatch[1].trim() : "0.0.0",
      updated: updatedMatch ? updatedMatch[1].trim() : new Date().toISOString().slice(0, 10),
      contentHash: computeSkillContentHash(skillDir, true),
      fullHash: computeSkillContentHash(skillDir, false),
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function incrementSemver(version, releaseType = "patch") {
  if (/^\d+\.\d+\.\d+$/.test(releaseType)) {
    return releaseType;
  }
  const parts = version.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);

  if (releaseType === "major") {
    return `${parts[0] + 1}.0.0`;
  }
  if (releaseType === "minor") {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function updateSkillMdFrontmatter(skillMdPath, newVersion, updatedDate) {
  let md = readFileSync(skillMdPath, "utf8");
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    throw new Error(`Missing YAML frontmatter in ${skillMdPath}`);
  }

  let fm = fmMatch[1];

  // Update or insert top-level `version:`
  if (/^version:\s*.*$/m.test(fm)) {
    fm = fm.replace(/^version:\s*.*$/m, `version: ${newVersion}`);
  } else {
    fm += `\nversion: ${newVersion}`;
  }

  // Update or insert `metadata:` block
  if (/^metadata:/m.test(fm)) {
    if (/^\s+version:\s*.*$/m.test(fm)) {
      fm = fm.replace(/^\s+version:\s*.*$/m, `  version: "${newVersion}"`);
    } else {
      fm = fm.replace(/^metadata:/m, `metadata:\n  version: "${newVersion}"`);
    }
    if (/^\s+updated:\s*.*$/m.test(fm)) {
      fm = fm.replace(/^\s+updated:\s*.*$/m, `  updated: "${updatedDate}"`);
    } else {
      fm += `\n  updated: "${updatedDate}"`;
    }
  } else {
    fm += `\nmetadata:\n  version: "${newVersion}"\n  author: nodirbekrajaboff\n  updated: "${updatedDate}"`;
  }

  const updatedMd = md.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${fm}\n---`);
  writeFileSync(skillMdPath, updatedMd, "utf8");
}

function loadVersionsManifest() {
  if (!existsSync(VERSIONS_FILE)) return { skills: {} };
  try {
    return JSON.parse(readFileSync(VERSIONS_FILE, "utf8"));
  } catch {
    return { skills: {} };
  }
}

function saveVersionsManifest(skills) {
  const manifest = {
    repository: "nodirbekrajaboff/my-skills",
    skills: {},
  };
  for (const s of skills) {
    manifest.skills[s.name] = {
      version: s.version,
      updated: s.updated,
      contentHash: computeSkillContentHash(s.dir, true),
      fullHash: computeSkillContentHash(s.dir, false),
    };
  }
  writeFileSync(VERSIONS_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

const [, , cmd = "list", arg1, arg2] = process.argv;
const manifest = loadVersionsManifest();
const skills = discoverSkills();
const today = new Date().toISOString().slice(0, 10);

if (cmd === "list" || cmd === "status") {
  console.log("Skill".padEnd(22), "Version".padEnd(10), "Updated".padEnd(12), "Hash".padEnd(18), "Status");
  console.log("-".repeat(76));
  for (const s of skills) {
    const prev = manifest.skills?.[s.name];
    const isModified = !prev || prev.contentHash !== s.contentHash;
    const status = !prev ? "NEW (untracked)" : isModified ? "MODIFIED (needs bump)" : "clean";
    console.log(
      s.name.padEnd(22),
      s.version.padEnd(10),
      s.updated.padEnd(12),
      s.contentHash.padEnd(18),
      status
    );
  }
} else if (cmd === "bump") {
  const targetName = arg1;
  const releaseType = arg2 || "patch";
  const target = skills.find((s) => s.name === targetName);
  if (!target) {
    console.error(`Skill "${targetName}" not found. Available: ${skills.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
  const nextVersion = incrementSemver(target.version, releaseType);
  updateSkillMdFrontmatter(target.skillMdPath, nextVersion, today);
  target.version = nextVersion;
  target.updated = today;
  saveVersionsManifest(discoverSkills());
  console.log(`Bumped ${target.name} -> v${nextVersion} (${today})`);
} else if (cmd === "sync") {
  const releaseType = arg1 || "patch";
  let bumpedCount = 0;
  for (const s of skills) {
    const prev = manifest.skills?.[s.name];
    if (!prev) {
      console.log(`Tracking new skill: ${s.name}@v${s.version}`);
      bumpedCount++;
    } else if (prev.contentHash !== s.contentHash) {
      const nextVersion = incrementSemver(s.version, releaseType);
      updateSkillMdFrontmatter(s.skillMdPath, nextVersion, today);
      console.log(`Auto-bumped modified skill ${s.name}: v${s.version} -> v${nextVersion}`);
      bumpedCount++;
    }
  }
  saveVersionsManifest(discoverSkills());
  if (bumpedCount === 0) {
    console.log("All skills are already in sync with versions.json.");
  }
} else {
  console.error(`Unknown command: ${cmd}. Use "list", "bump <skill> [patch|minor|major]", or "sync".`);
  process.exit(1);
}
