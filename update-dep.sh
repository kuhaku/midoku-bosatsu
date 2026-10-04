#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

npx npm-check-updates -u

{
    cd src-tauri
    cargo update
    cd ../
}

bash test.sh
