/* =====================================================================
 *  EDIT THIS FILE  — paste your Supabase keys, then save.
 *  Find them in Supabase:  Project Settings → API
 * ===================================================================== */
window.WC_CONFIG = {
  // From Supabase → Project Settings → API
  SUPABASE_URL: "https://pnaqxccsealvwzxuipch.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_NSVmCyk2Q16GR2PIId1YIQ_40Q1le2C",

  // --- Challenge settings (drive week maths & the payout) ---
  CHALLENGE_START: "2026-05-25", // first day of week 1 (you're ~1 week in)
  CHALLENGE_MONTHS: 3,

  // --- Rules from your agreement (change only if you all agree) ---
  MIN_DURATION_MIN: 30,      // a workout must last at least this long
  MIN_GAP_HOURS: 8,          // gap required between counting workouts
  MAX_WORKOUTS_PER_WEEK: 4,  // only this many earn per week
  DOLLARS_PER_WORKOUT: 5,    // $ earned per counting workout
  SICK_DAYS_ALLOWANCE: 4,    // sick/recovery days allowed across the challenge
  SICK_DAY_DOLLARS: 5,       // $ earned per sick/recovery day (within the allowance)

  // --- Profile photos (files live in the /avatars folder) ---
  // If a file is missing, the app just shows the person's initial instead.
  AVATARS: {
    Jake: "avatars/jake.jpg",
    Trent: "avatars/trent.jpg",
    Mitchell: "avatars/mitchell.jpg",
  },

  // Photos are pre-cropped to square headshots, so they already sit nicely
  // in the circle. (This still lets you nudge the focus if you swap in a
  // non-square photo later: e.g. Trent: "center top".)
  AVATAR_POS: {
    Jake: "center",
    Trent: "center",
    Mitchell: "center",
  },
};
