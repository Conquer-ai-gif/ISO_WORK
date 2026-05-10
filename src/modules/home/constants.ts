export interface Template {
  emoji: string
  title: string
  description: string
  category: string
  prompt: string
  image: string // Unsplash image URL
}

export const TEMPLATE_CATEGORIES = [
  'All',
  'Productivity',
  'E-commerce',
  'Social',
  'Dashboard',
  'Landing Page',
  'Entertainment',
  'Tools',
] as const

export const PROJECT_TEMPLATES: Template[] = [
  // ── Productivity ──────────────────────────────────────────────────────────
  {
    emoji: '📋',
    title: 'Kanban board',
    description: 'Drag-and-drop task management',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=600&q=80',
    prompt: 'Build a kanban board with columns (To Do, In Progress, Done), drag-and-drop cards using react-beautiful-dnd, ability to add/edit/delete cards and columns, and local state persistence. Use clean card design with priority badges and due dates.',
  },
  {
    emoji: '📝',
    title: 'Note-taking app',
    description: 'Markdown notes with folders',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&q=80',
    prompt: 'Build a note-taking app like Notion Lite with a folder sidebar, markdown-rendered notes, full-text search, pinned notes, and tags. Store everything in localStorage. Split-pane layout with editor on right.',
  },
  {
    emoji: '⏱️',
    title: 'Pomodoro timer',
    description: 'Focus sessions with task tracking',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&q=80',
    prompt: 'Build a Pomodoro timer app with 25min work / 5min break cycles, task list to track what you worked on, session history, and streak counter. Include ambient sound toggle buttons (Rain, Forest, Cafe as labels). Dark mode by default.',
  },
  {
    emoji: '📅',
    title: 'Calendar app',
    description: 'Monthly view with events',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=600&q=80',
    prompt: 'Build a monthly calendar app with ability to add/edit/delete events, event color coding, a today button, and a sidebar showing upcoming events. Use react-big-calendar or build from scratch with Tailwind grid.',
  },
  {
    emoji: '💰',
    title: 'Budget tracker',
    description: 'Income, expenses, and charts',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&q=80',
    prompt: 'Build a personal budget tracker with income and expense entries, category tags, monthly summary with a pie chart (use recharts), and running balance. Store in localStorage. Clean table layout with color-coded amounts.',
  },
  {
    emoji: '🎯',
    title: 'Habit tracker',
    description: 'Daily habits with streaks',
    category: 'Productivity',
    image: 'https://images.unsplash.com/photo-1495364141860-b0d03eccd065?w=600&q=80',
    prompt: 'Build a habit tracker where users add daily habits, check them off each day, see a streak count, and view a 30-day completion grid (like GitHub contribution graph). Store in localStorage with realistic example habits pre-loaded.',
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    emoji: '📊',
    title: 'Analytics dashboard',
    description: 'Charts, stats, and metrics',
    category: 'Dashboard',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80',
    prompt: 'Build an analytics dashboard with a sidebar nav, KPI stat cards (users, revenue, conversions, churn), line chart for traffic over time, bar chart for top pages, and a recent events table. Use recharts. Mock data should look realistic.',
  },
  {
    emoji: '👥',
    title: 'CRM dashboard',
    description: 'Contacts, deals, and pipeline',
    category: 'Dashboard',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80',
    prompt: 'Build a CRM dashboard with a contacts list (avatar, name, company, status), deal pipeline kanban view, activity feed sidebar, and quick-add contact form. Use realistic mock data with 10+ contacts and deals.',
  },
  {
    emoji: '📦',
    title: 'Admin panel',
    description: 'Users, settings, and tables',
    category: 'Dashboard',
    image: 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=600&q=80',
    prompt: 'Build a full admin panel with sidebar navigation (Dashboard, Users, Orders, Products, Settings), a users table with search/filter/sort/pagination, stat cards at top, and a simple settings form. Professional dark sidebar design.',
  },
  {
    emoji: '📈',
    title: 'Stock portfolio',
    description: 'Holdings, P&L, and charts',
    category: 'Dashboard',
    image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80',
    prompt: 'Build a stock portfolio tracker with holdings table (ticker, shares, avg cost, current price, P&L), portfolio allocation pie chart, total value card with daily change, and a sparkline chart per holding. Use recharts and realistic mock data.',
  },

  // ── E-commerce ────────────────────────────────────────────────────────────
  {
    emoji: '🛍️',
    title: 'E-commerce store',
    description: 'Products, cart, and checkout',
    category: 'E-commerce',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80',
    prompt: 'Build an e-commerce store with a product grid (image placeholder, name, price, rating stars), category filter sidebar, product detail modal, shopping cart drawer with quantity controls, and a mock checkout form. At least 12 products.',
  },
  {
    emoji: '🏡',
    title: 'Airbnb clone',
    description: 'Property listings and booking',
    category: 'E-commerce',
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80',
    prompt: 'Build an Airbnb-style listings page with a search bar, filter chips (price range, bedrooms, amenities), property card grid with image placeholder, rating, price per night, and a property detail modal with booking form. 10+ listings.',
  },
  {
    emoji: '🍕',
    title: 'Food delivery app',
    description: 'Restaurants, menu, and orders',
    category: 'E-commerce',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80',
    prompt: 'Build a food delivery app homepage with restaurant cards (cuisine type, rating, delivery time), a menu page with categories and items, add-to-cart functionality, and an order summary sidebar. Use local state. Vibrant food-themed design.',
  },
  {
    emoji: '👗',
    title: 'Fashion store',
    description: 'Clothing grid with filters',
    category: 'E-commerce',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80',
    prompt: 'Build a fashion e-commerce store with a minimal, editorial design. Include product grid with hover zoom effect, size selector, color swatches, wishlist toggle, filter drawer (size, color, price), and a cart sidebar. Monochrome aesthetic.',
  },

  // ── Social ────────────────────────────────────────────────────────────────
  {
    emoji: '🐦',
    title: 'Twitter / X clone',
    description: 'Feed, tweets, and profiles',
    category: 'Social',
    image: 'https://images.unsplash.com/photo-1611605698335-8441dc011a41?w=600&q=80',
    prompt: 'Build a Twitter/X clone with a main feed of tweets (avatar, name, handle, content, likes/retweets/replies counts), compose tweet box, trending sidebar, and a profile page with tabs for Posts, Replies, Media. Local state with 15+ mock tweets.',
  },
  {
    emoji: '📸',
    title: 'Instagram clone',
    description: 'Photo grid and stories',
    category: 'Social',
    image: 'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=600&q=80',
    prompt: 'Build an Instagram-style app with a stories row at top, photo grid feed with like/comment/save actions, a stories viewer modal, explore grid page, and a profile page with follower stats and post grid. Use colored placeholder divs for images.',
  },
  {
    emoji: '💬',
    title: 'Chat app',
    description: 'Conversations and messages',
    category: 'Social',
    image: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=600&q=80',
    prompt: 'Build a chat app UI with a contacts sidebar (online indicators, last message preview), message thread view with sent/received bubbles, typing indicator animation, emoji picker placeholder, and file attachment button. Make it feel like iMessage or WhatsApp.',
  },
  {
    emoji: '🎮',
    title: 'Discord clone',
    description: 'Servers, channels, and chat',
    category: 'Social',
    image: 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=600&q=80',
    prompt: 'Build a Discord-style app with a server list sidebar, channel list for the selected server (text and voice channels), main chat area with messages and user avatars, and a members panel on the right. Dark theme. Realistic server and message mock data.',
  },

  // ── Landing Page ──────────────────────────────────────────────────────────
  {
    emoji: '🚀',
    title: 'SaaS landing page',
    description: 'Hero, features, and pricing',
    category: 'Landing Page',
    image: 'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=600&q=80',
    prompt: 'Build a modern SaaS landing page with a hero section (bold headline, subtext, CTA buttons, gradient background), features grid with icons, social proof logos, pricing table with 3 tiers, FAQ accordion, and footer. Professional and conversion-focused.',
  },
  {
    emoji: '📱',
    title: 'App landing page',
    description: 'Mobile app showcase',
    category: 'Landing Page',
    image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80',
    prompt: 'Build a mobile app landing page with a hero section featuring an app screenshot mockup (colored div), feature highlights with icons, how-it-works 3-step section, testimonials carousel, and app store download buttons. Clean, modern design.',
  },
  {
    emoji: '🎨',
    title: 'Portfolio site',
    description: 'Projects, skills, and contact',
    category: 'Landing Page',
    image: 'https://images.unsplash.com/photo-1545665277-5937489579f2?w=600&q=80',
    prompt: 'Build a personal portfolio website with an animated hero section (name, title, typing effect), about section with skills grid, projects showcase with hover overlay, work experience timeline, and a contact form. Minimal dark theme.',
  },
  {
    emoji: '🏢',
    title: 'Agency website',
    description: 'Services, work, and team',
    category: 'Landing Page',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80',
    prompt: 'Build a creative agency website with a full-screen hero with bold typography, services cards with hover effects, portfolio grid with filter tabs, team member cards, client logos row, and contact section. Premium agency aesthetic.',
  },

  // ── Entertainment ─────────────────────────────────────────────────────────
  {
    emoji: '🎬',
    title: 'Netflix clone',
    description: 'Movie rows and player',
    category: 'Entertainment',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
    prompt: 'Build a Netflix-style streaming homepage with a hero banner (featured show), horizontal scrollable movie rows by genre, movie card hover effects with title and rating, and a modal player with title, description, and rating. Dark mode throughout.',
  },
  {
    emoji: '🎵',
    title: 'Spotify clone',
    description: 'Music player with playlists',
    category: 'Entertainment',
    image: 'https://images.unsplash.com/photo-1614680376408-81e91ffe3db7?w=600&q=80',
    prompt: 'Build a Spotify-style music player with a sidebar (playlists, library), main area showing an album/playlist with track list, a bottom playback bar with progress slider, volume control, and play/pause/skip controls. Use dark theme with green accents.',
  },
  {
    emoji: '📺',
    title: 'YouTube clone',
    description: 'Video grid and player',
    category: 'Entertainment',
    image: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&q=80',
    prompt: 'Build a YouTube-style homepage with a category filter row, video card grid (thumbnail placeholder, title, channel name, views, time ago), sidebar navigation, and a video player page with description, like button, and comments section.',
  },
  {
    emoji: '📚',
    title: 'Book library',
    description: 'Reading list and reviews',
    category: 'Entertainment',
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
    prompt: 'Build a personal book library app with a bookshelf grid view (cover color placeholder, title, author, rating), reading status filter (Reading, To Read, Done), book detail modal with notes and progress bar, and an add-book form.',
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    emoji: '🗂️',
    title: 'File manager',
    description: 'Folders, files, and preview',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=600&q=80',
    prompt: 'Build a file manager with a folder tree sidebar, file grid view with list/grid toggle, file type icons, multi-select with checkbox, right-click context menu (rename, delete, copy), and a breadcrumb path bar. Desktop app aesthetic.',
  },
  {
    emoji: '🔗',
    title: 'URL shortener',
    description: 'Shorten, track, and manage links',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&q=80',
    prompt: 'Build a URL shortener tool with a URL input form, generated short link display with copy button, links table (original URL, short code, clicks, created date), click count chart, and QR code placeholder. Clean minimal design.',
  },
  {
    emoji: '🖼️',
    title: 'Image gallery',
    description: 'Masonry grid with lightbox',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    prompt: 'Build a photo gallery with a masonry grid layout (use colored divs as image placeholders), category filter tabs, image lightbox modal with prev/next navigation, zoom in/out, and download button. Clean white aesthetic.',
  },
  {
    emoji: '✉️',
    title: 'Email client',
    description: 'Inbox, compose, and threads',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=600&q=80',
    prompt: 'Build an email client UI with a folder sidebar (Inbox, Sent, Drafts, Trash with unread counts), email list with sender, subject, preview, and time, an email thread view, and a compose modal with to/subject/body fields. Gmail-inspired layout.',
  },
  {
    emoji: '🧮',
    title: 'Invoice generator',
    description: 'Create and export invoices',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1554224155-1696413565d3?w=600&q=80',
    prompt: 'Build an invoice generator with a form to add client info, line items (description, qty, unit price), auto-calculated subtotal/tax/total, invoice number and date, and a print-ready preview layout. Professional clean design.',
  },
  {
    emoji: '🗺️',
    title: 'Travel planner',
    description: 'Trips, itineraries, and packing',
    category: 'Tools',
    image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80',
    prompt: 'Build a travel planner with a trips list, itinerary day-by-day planner (drag to reorder activities), packing checklist with categories, budget tracker per trip, and a notes section. Use local state with a sample trip pre-loaded.',
  },
]
