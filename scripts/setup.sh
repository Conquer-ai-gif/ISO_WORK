#!/bin/bash
set -e

echo "🚀 Setting up Lunee..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org"
  exit 1
fi
echo "✅ Node $(node -v)"

if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo ""
  echo "📋 .env.local created from example."
  echo "   Fill in all the values then run this script again."
  echo "   See README.md for where to get each key."
  echo ""
  exit 0
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Running database migrations..."
npx prisma migrate dev --name init

echo ""
echo "✅ Setup complete! Start the app:"
echo ""
echo "   Terminal 1:  npm run dev"
echo "   Terminal 2:  npx inngest-cli@latest dev"
echo ""
