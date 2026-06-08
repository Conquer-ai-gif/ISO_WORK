FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /home/user

RUN pnpm dlx create-next-app@15.5.6 . --yes

RUN pnpm dlx shadcn@latest init --yes -b base --force
RUN pnpm dlx shadcn@latest add --all --yes

RUN pnpm add zod

# FIX: copy to /home/user instead of / (root).
# E2B's provisioning layers may not preserve files copied to /.
# /home/user is the working directory and is preserved across layers.
COPY compile_page.sh /home/user/compile_page.sh
RUN chmod +x /home/user/compile_page.sh



# FROM node:20-slim

# RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# WORKDIR /home/user

# RUN pnpm dlx create-next-app@15.5.6 . --yes

# # Install shadcn as a proper dependency instead of using pnpm dlx
# # pnpm dlx runs packages temporarily and E2B may not preserve the generated files
# RUN pnpm add shadcn

# # Init shadcn using the locally installed binary
# RUN pnpm shadcn init --yes -b base --force

# # Add all shadcn components using the locally installed binary
# RUN pnpm shadcn add --all --yes

# # Verify components were actually generated — build will fail here if they weren't
# # This confirms whether the issue is in Docker or in E2B snapshotting
# RUN ls /home/user/components/ui

# COPY compile_page.sh /home/user/compile_page.sh
# RUN chmod +x /home/user/compile_page.sh





# FROM node:20-slim

# RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# WORKDIR /home/user

# RUN pnpm dlx create-next-app@15.5.6 . --yes

# RUN pnpm dlx shadcn@latest init --yes -b base --force
# RUN pnpm dlx shadcn@latest add --all --yes

# RUN pnpm add zod

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# FROM node:20-slim

# # Enable corepack (recommended for pnpm)
# RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# # Install curl
# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# # Set working directory directly to /home/user — no move step needed
# WORKDIR /home/user

# # Create Next.js app directly in /home/user
# RUN pnpm dlx create-next-app@15.5.6 . --yes

# # Initialize shadcn UI — components/ui will land in /home/user/components/ui
# RUN pnpm dlx shadcn@latest init --yes -b base --force
# RUN pnpm dlx shadcn@latest add --all --yes

# # Install Zod
# RUN pnpm add zod




# # You can use most Debian-based base images
# # FROM node:21-slim

# # # Install curl
# # RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# # COPY compile_page.sh /compile_page.sh
# # RUN chmod +x /compile_page.sh

# # # Install dependencies and customize sandbox
# # WORKDIR /home/user/nextjs-app

# # RUN npx --yes create-next-app@15.5.6 . --yes --typescript --tailwind

# # RUN npx --yes shadcn-ui@latest init --yes -d
# # RUN npx --yes shadcn-ui@latest add --all --yes

# # # Move the Nextjs app to the home directory and remove the nextjs-app directory
# # RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app



# # FROM node:21-slim

# # RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# # COPY compile_page.sh /compile_page.sh
# # RUN chmod +x /compile_page.sh

# # WORKDIR /home/user/nextjs-app

# # # Create Next.js WITHOUT Tailwind (important)
# # RUN npx --yes create-next-app@15.5.6 . --yes 


# # RUN npx --yes shadcn-ui@latest init --yes -d

# # # install ONLY selected components (not all)
# # RUN npx --yes shadcn-ui@latest add button input dialog form toast --yes

# # # # Move app
# # RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app


# # # Base image
# # FROM node:21-slim

# # # Enable corepack (recommended for pnpm)
# # RUN corepack enable

# # # Install curl
# # RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# # COPY compile_page.sh /compile_page.sh
# # RUN chmod +x /compile_page.sh

# # # Set working directory
# # WORKDIR /home/user/nextjs-app

# # # Create Next.js app using pnpm dlx instead of npx
# # RUN pnpm dlx create-next-app@15.5.6 . --yes

# # # Initialize shadcn UI with pnpm
# # RUN pnpm dlx shadcn@latest init --yes -b neutral --force
# # RUN pnpm dlx shadcn@latest add --all --yes

# # # Move app contents to home directory
# # RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app



# # Base image
# FROM node:20-slim

# # Enable corepack (recommended for pnpm)
# RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# # Install curl
# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# # Set working directory
# WORKDIR /home/user/nextjs-app

# # Create Next.js app using pnpm dlx instead of npx
# RUN pnpm dlx create-next-app@15.5.6 . --yes

# # Initialize shadcn UI with pnpm
# RUN pnpm dlx shadcn@latest init --yes -b base --force
# RUN pnpm dlx shadcn@latest add --all --yes

# # ✅ Install Zod
# RUN pnpm add zod

# # Move app contents including hidden files
# RUN cp -r /home/user/nextjs-app/. /home/user/ && rm -rf /home/user/nextjs-app