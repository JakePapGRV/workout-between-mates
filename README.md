# 🏋️ Workout Challenge

A little web app for your 3-month mates' workout bet. Each person times (or logs) a
workout, it lands on a **shared leaderboard** everyone can see, and the app works out
who's earned what — and who owes who at the end.

It enforces your agreement automatically:

- A workout must be **≥ 30 minutes** to count
- **≥ 8 hours** between workouts that count
- Only **4 workouts/week** earn money (**$5 each**, max **$20/week**)
- **4 sick/recovery days** tracked across the challenge (don't earn, don't penalise)
- Final payout: **lowest total pays the difference to the highest**

---

## One-time setup (~10 minutes)

You only need to do this once. Then everyone just opens a link on their phone.

### 1. Create the free database (Supabase)

1. Go to **[supabase.com](https://supabase.com)** → sign up → **New project**.
   - Pick any name/password, choose a region near you, free tier is fine.
   - Wait ~2 min for it to finish provisioning.
2. In the left sidebar open **SQL Editor** → **New query**.
3. Open `schema.sql` from this folder, **edit the names** in the seed section to your
   actual mates, then paste the whole file in and click **Run**.

### 2. Paste your keys into the app

1. In Supabase go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public** key.
3. Open `config.js` and paste them in:
   ```js
   SUPABASE_URL: "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi....",
   ```
4. While you're there, check `CHALLENGE_START` is right (your first day of week 1).

### 3. Put it online so everyone can use it

The easiest free option — **Netlify Drop**:

1. Go to **[app.netlify.com/drop](https://app.netlify.com/drop)**.
2. Drag this whole folder onto the page.
3. It gives you a URL like `https://your-name.netlify.app` — **share that with your mates.**

Other free options that work the same way: **Vercel**, **Cloudflare Pages**, or
**GitHub Pages**. Any static host works — there's no build step.

> Want to just try it on your own computer first? Run a quick local server in this
> folder (e.g. `python -m http.server`) and open `http://localhost:8000`. Opening
> `index.html` directly from disk mostly works too, but a server is more reliable.

---

## Using it

- **First open:** tap your name. The device remembers you (tap your name top-right to switch).
- **Time a workout:** tap **Start**, do your thing, tap **Stop & log**, type what you did.
- **Forgot to time it?** **＋ Log past workout** lets you enter date/time/duration.
- **Sick day:** **🤒 Log sick day** records a recovery day (doesn't earn, doesn't hurt you).
- **Leaderboard:** tap any mate to see all their workouts, durations and descriptions.
  Each row shows whether it counted (and why not, if it didn't).
- **Payout:** the bottom card shows who'd win and who'd pay if it ended today.

---

## Notes

- **The anon key is meant to be public** — it ships inside the page. Security comes from
  the database rules in `schema.sql`, which let anyone with the link read the leaderboard,
  log a workout, and delete a workout (to fix mistakes). Keep the link within your group.
  This runs on the honour system, just like the agreement.
- **Week boundaries** are anchored to `CHALLENGE_START` (week 1 = first 7 days, etc.) and
  use each device's local time zone.
- Want to change a rule? Edit the values in `config.js` — the whole app and the rules
  list update to match.

## Files

| File | What it is |
|------|------------|
| `index.html` | The page |
| `styles.css` | Styling (mobile-first, dark) |
| `app.js` | All the logic + rules engine |
| `config.js` | **Your** Supabase keys + challenge settings |
| `schema.sql` | Run once in Supabase to create the tables + seed names |
