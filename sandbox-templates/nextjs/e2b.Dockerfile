# # You can use most Debian-based base images
# FROM node:21-slim

# # Install curl
# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# # Install dependencies and customize sandbox
# WORKDIR /home/user/nextjs-app

# RUN npx --yes create-next-app@15.5.6 . --yes --typescript --tailwind

# RUN npx --yes shadcn-ui@latest init --yes -d
# RUN npx --yes shadcn-ui@latest add --all --yes

# # Move the Nextjs app to the home directory and remove the nextjs-app directory
# RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app



# FROM node:21-slim

# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# WORKDIR /home/user/nextjs-app

# # Create Next.js WITHOUT Tailwind (important)
# RUN npx --yes create-next-app@15.5.6 . --yes 


# RUN npx --yes shadcn-ui@latest init --yes -d

# # install ONLY selected components (not all)
# RUN npx --yes shadcn-ui@latest add button input dialog form toast --yes

# # # Move app
# RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app


# # Base image
# FROM node:21-slim

# # Enable corepack (recommended for pnpm)
# RUN corepack enable

# # Install curl
# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY compile_page.sh /compile_page.sh
# RUN chmod +x /compile_page.sh

# # Set working directory
# WORKDIR /home/user/nextjs-app

# # Create Next.js app using pnpm dlx instead of npx
# RUN pnpm dlx create-next-app@15.5.6 . --yes

# # Initialize shadcn UI with pnpm
# RUN pnpm dlx shadcn@latest init --yes -b neutral --force
# RUN pnpm dlx shadcn@latest add --all --yes

# # Move app contents to home directory
# RUN mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app



# Base image
FROM node:20-slim

# Enable corepack (recommended for pnpm)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install curl
RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY compile_page.sh /compile_page.sh
RUN chmod +x /compile_page.sh

# Set working directory
WORKDIR /home/user/nextjs-app

# Create Next.js app using pnpm dlx instead of npx
RUN pnpm dlx create-next-app@15.5.6 . --yes

# Initialize shadcn UI with pnpm
RUN pnpm dlx shadcn@latest init --yes -b base --force
RUN pnpm dlx shadcn@latest add --all --yes

# ✅ Install Zod
RUN pnpm add zod

# Move app contents including hidden files
RUN cp -r /home/user/nextjs-app/. /home/user/ && rm -rf /home/user/nextjs-app