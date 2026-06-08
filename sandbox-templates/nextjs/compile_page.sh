#!/bin/bash

# This script runs when the sandbox starts.
# It starts the Next.js dev server bound to 0.0.0.0 so e2b can expose port 3000,
# and captures stderr to /tmp/next-error.log so the error auto-fix step can read
# compilation errors.

function ping_server() {
  counter=0
  while true; do
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
    if [[ "$response" == "200" ]]; then
      echo "Server is ready!"
      break
    fi
    let counter++ || true
    if (( counter % 20 == 0 )); then
      echo "Waiting for server to start..."
    fi
    sleep 0.5
  done
}

ping_server &

# FIX: use 'pnpm next dev' directly with correct flag order.
# Previous: pnpm dev -- --turbopack -H 0.0.0.0 -p 3000 (incorrect syntax)
# /home/user is the Next.js app directory set up by the Dockerfile
cd /home/user && pnpm next dev --turbopack -H 0.0.0.0 -p 3000 2> >(tee /tmp/next-error.log >&2)


# #!/bin/bash

# # This script runs when the sandbox starts.
# # It starts the Next.js dev server bound to 0.0.0.0 so e2b can expose port 3000,
# # and captures stderr to /tmp/next-error.log so the error auto-fix step can read
# # compilation errors.

# function ping_server() {
# 	counter=0
# 	while true; do
# 		response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
# 		if [[ "$response" == "200" ]]; then
# 			echo "Server is ready!"
# 			break
# 		fi
# 		let counter++ || true
# 		if (( counter % 20 == 0 )); then
# 			echo "Waiting for server to start..."
# 		fi
# 		sleep 0.5
# 	done
# }

# ping_server &

# cd /home/user && pnpm dev -- --turbopack -H 0.0.0.0 -p 3000 2> >(tee /tmp/next-error.log >&2)



# # !/bin/bash

# # This script runs when the sandbox starts.
# # It starts the Next.js dev server and captures stderr to /tmp/next-error.log
# # so the error auto-fix step can read compilation errors.

# # function ping_server() {
# # 	counter=0
# # 	response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
# # 	while [[ ${response} -ne 200 ]]; do
# # 	  let counter++
# # 	  if  (( counter % 20 == 0 )); then
# #         echo "Waiting for server to start..."
# #         sleep 0.1
# #       fi
# # 	  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
# # 	done
# # }

# # ping_server &
# # cd /home/user && npx next dev --turbopack 2> >(tee /tmp/next-error.log >&2)


# #!/bin/bash

# # This script runs when the sandbox starts.
# # It starts the Next.js dev server and captures stderr to /tmp/next-error.log
# # so the error auto-fix step can read compilation errors.

# function ping_server() {
# 	counter=0
# 	response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")

# 	while [[ ${response} -ne 200 ]]; do
# 		let counter++

# 		if (( counter % 20 == 0 )); then
# 			echo "Waiting for server to start..."
# 			sleep 0.1
# 		fi

# 		response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
# 	done
# }

# ping_server &

# cd /home/user && pnpm next dev --turbopack 2> >(tee /tmp/next-error.log >&2)