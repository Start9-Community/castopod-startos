# Updating the upstream version

This package pins two published images in `startos/manifest/index.ts`.

## Determining the upstream version

### Castopod (`images.castopod.source.dockerTag`)

Castopod releases are tagged `vX.Y.Z` at https://code.castopod.org/adaures/castopod/-/releases, and the official image is published as `castopod/castopod:X.Y.Z` on Docker Hub:

```bash
curl -s "https://hub.docker.com/v2/repositories/castopod/castopod/tags?page_size=25" \
  | jq -r '.results[] | "\(.name)  \([.images[]?.architecture] | join(","))"'
```

Skip `latest`, `1`, `develop`, `next`, `*-next.*` and other channel tags. **Check the arches of the tag you pick**: several past releases were published for `amd64` only. A release without `arm64` cannot be shipped; wait for the next one.

### MariaDB (`images.mariadb.source.dockerTag`)

Pinned to a patch release of the 11.8 LTS line (`mariadb:11.8.N`). Take the newest `11.8.N` from:

```bash
curl -s "https://hub.docker.com/v2/repositories/library/mariadb/tags?page_size=100&name=11.8." | jq -r '.results[].name' | sort -V
```

Stay on 11.8 unless Castopod's own compose example or requirements move past it.

## Applying the bump

- Castopod: set `dockerTag` to `castopod/castopod:X.Y.Z` (no `v` prefix). Read upstream's `CHANGELOG.md` for the release: if `docker/production/s6-rc.d/bootstrap/prepare-environment.sh` changed, check that the `CP_*` variables passed in `startos/main.ts` still mean the same thing, that the bootstrap's `up` still only runs that script (the package replaces it to redact the `.env` printout), and that no new secret it prints escapes the redaction pattern, and that the `install:create-superadmin`, `install:init-database`, `shield:user password` and `shield:user changeemail` prompts the scripts pipe into are unchanged.
- MariaDB: set `dockerTag` to `mariadb:11.8.N`.
