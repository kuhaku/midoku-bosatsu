#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

npm run version:set -- $1
bash ./test.sh
