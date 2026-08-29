#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

npm test

cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
