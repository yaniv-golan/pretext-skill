# Versioning

This project uses [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

## Version Source of Truth

The canonical version lives in the `VERSION` file at the repo root. All other version locations are updated from it.

## Version Locations

The version appears in these files (all managed by the bump script):

1. `VERSION` — source of truth
2. `pretext/.claude-plugin/plugin.json` → `"version"` field
3. `.cursor-plugin/plugin.json` → `"version"` field
4. `pretext/skills/pretext/SKILL.md` → `metadata.version` in YAML frontmatter
5. `pretext/skills/pretext/VERSION` → copied from root

## Bumping the Version

```bash
# Set a new version and propagate to all locations:
./tools/bump-version.sh 0.2.0

# Or edit VERSION manually, then propagate:
./tools/bump-version.sh
```

## Tracking upstream

The skill documents one pinned version of `@chenglou/pretext`, installed in `tools/verify`. To move to a new upstream release:

1. Bump the pin: `( cd tools/verify && npm install --save-exact @chenglou/pretext@<version> )`.
2. Run the verifier: `npm --prefix tools/verify run verify`. Every `FAIL` line names the file, line and claim that no longer holds.
3. Read upstream's `CHANGELOG.md` for the new version (in `tools/verify/node_modules/@chenglou/pretext/`), including changes the verifier can't see, such as new caveats.
4. Update the claims: the references, `SKILL.md`, the version in its `compatibility` field, and the pinned `blob/v<version>/` upstream links. Re-run the verifier until it exits 0.

## Release Process

```bash
# 1. Verify the skill against the pinned upstream version (must exit 0)
npm --prefix tools/verify run verify

# 2. Bump version
./tools/bump-version.sh X.Y.Z

# 3. Update CHANGELOG.md with a new "## [X.Y.Z] - YYYY-MM-DD" entry
#    (the release workflow extracts notes from here via awk)

# 4. Commit
git add VERSION CHANGELOG.md pretext/skills/pretext/VERSION \
        pretext/skills/pretext/SKILL.md \
        pretext/.claude-plugin/plugin.json \
        .cursor-plugin/plugin.json
git commit -m "Release vX.Y.Z: <one-line summary>"

# 5. Tag and push (tag separately — avoids pushing all local tags)
git tag -a vX.Y.Z -m "vX.Y.Z: <one-line summary>"
git push origin main
git push origin vX.Y.Z
```

CI (`.github/workflows/release.yml`) runs on `v*` tags, builds `pretext-skill.zip`, extracts the matching CHANGELOG section as release notes, and publishes a GitHub Release. If you want different copy on the release page than what's in CHANGELOG.md, edit the release directly afterwards: `gh release edit vX.Y.Z --notes-file <file>`.
