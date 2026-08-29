#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

npm install
npm test
npm run build

cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
