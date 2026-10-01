#!/bin/sh
# Rebuild _배포/ (what "npx vercel deploy --prod --yes" sends from inside it) from the sources:
# the page, its files, the api/ functions and package.json (which makes them ES modules). It deploys nothing.
#   sh scripts/deploy-copy.sh
set -eu
cd "$(dirname "$0")/.."
D="_배포"
mkdir -p "$D"
# everything but the Vercel link (.vercel) and .gitignore is replaced, so a file removed here is removed there too
find "$D" -mindepth 1 -maxdepth 1 ! -name .vercel ! -name .gitignore -exec rm -rf {} +
cp index.html style.css friends.json og.png package.json "$D"/
cp -R js api "$D"/
find "$D" -name .DS_Store -delete
# a link preview on X needs the picture's full address, not og.png next to the page
perl -pi -e 's|content="og\.png"|content="https://dragon-stakes.vercel.app/og.png"|g' "$D/index.html"
echo "$D rebuilt:"; (cd "$D" && find . -path ./.vercel -prune -o -type f -print | sort)
