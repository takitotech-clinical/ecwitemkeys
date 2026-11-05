#!/usr/bin/env bash
# Creates the proposal labels (PLAN §9 step 5). Requires the GitHub CLI, authenticated.
set -euo pipefail
repo=takitotech-clinical/ecwitemkeys
label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force; }
label edit-proposal    1d76db 'Proposed edit to an item key (created by the app)'
label proposal:valid   0e8a16 'Proposal passed validation'
label proposal:invalid d93f0b 'Proposal failed validation'
label approved         2da44e 'Approved by a maintainer; will be applied'
label rejected         b60205 'Rejected by a maintainer'
label conflict         fbca04 'The value changed after the proposal was made'
label applied          5319e7 'Applied to the data'
