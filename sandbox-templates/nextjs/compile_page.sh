#!/bin/bash

# This script runs when the sandbox starts.
# It starts the Next.js dev server and captures stderr to /tmp/next-error.log
# so the error auto-fix step can read compilation errors.

function ping_server() {
	counter=0
	response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
	while [[ ${response} -ne 200 ]]; do
	  let counter++
	  if  (( counter % 20 == 0 )); then
        echo "Waiting for server to start..."
        sleep 0.1
      fi
	  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
	done
}

ping_server &
cd /home/user && npx next dev --turbopack 2> >(tee /tmp/next-error.log >&2)
