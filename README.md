# Command Center

Your personal client & task management dashboard.

---

## 1. Set Up the Database (Supabase)

1. Go to **supabase.com** → your project → **SQL Editor** → New Query
2. Paste the contents of `setup.sql` and hit **Run**
3. Your tables are ready ✓

---

## 2. Run Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:5173 — you're live!

---

## 3. Deploy to Vercel

### Option A: Drag & Drop (easiest)
1. Run `npm run build` — this creates a `dist/` folder
2. Go to **vercel.com** → Add New Project → drag the `dist/` folder in
3. Done — you get a live URL instantly

### Option B: GitHub (best for ongoing updates)
1. Push this project to a GitHub repo
2. Go to **vercel.com** → Add New Project → Import from GitHub
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Every push to GitHub auto-deploys ✓

---

## Features

- ✅ Add clients with custom emoji & color
- ✅ Brain Dump input with smart parsing (times, dates, ASAP/!! priority)
- ✅ Tasks per client with check-off
- ✅ Missed tasks panel on return
- ✅ Today / Backlog / Clients / All Tasks views
- ✅ Search across all tasks
- ✅ All data persists in Supabase

## Smart Task Parsing

The brain dump input understands:
- `Call Tom at 4pm` → schedules for 4 PM
- `Fix homepage tomorrow` → schedules for tomorrow
- `Send invoice ASAP` → marks as ASAP priority
- `!!` → high priority shorthand
- `@clientname` → (stripped, use the client dropdown instead)
