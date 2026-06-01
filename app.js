/* =====================================================================
 *  Workout Challenge — app logic
 * ===================================================================== */
(function () {
  "use strict";

  const CFG = window.WC_CONFIG || {};
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  const RULES = {
    minDurationSec: (CFG.MIN_DURATION_MIN ?? 30) * 60,
    minGapMs: (CFG.MIN_GAP_HOURS ?? 8) * HOUR,
    maxPerWeek: CFG.MAX_WORKOUTS_PER_WEEK ?? 4,
    dollars: CFG.DOLLARS_PER_WORKOUT ?? 5,
    sickAllowance: CFG.SICK_DAYS_ALLOWANCE ?? 4,
  };

  const startDate = parseLocalDate(CFG.CHALLENGE_START || "2026-05-25");
  const endDate = addMonths(startDate, CFG.CHALLENGE_MONTHS ?? 3);
  const totalWeeks = Math.max(1, Math.ceil((endDate - startDate) / WEEK));

  // ---- Supabase ----
  const configured =
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !CFG.SUPABASE_ANON_KEY.includes("YOUR-ANON");
  const sb =
    configured && window.supabase
      ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
      : null;

  // ---- State ----
  let participants = [];
  let workouts = [];
  let me = localStorage.getItem("wc_me") || null;
  let tick = null; // timer interval
  let loaded = false; // becomes true after the first data load
  let loadError = null; // last data-load error message, if any

  const $ = (id) => document.getElementById(id);
  const overlay = $("overlay");

  /* ---------------------------------------------------------------
   *  Helpers
   * ------------------------------------------------------------- */
  function parseLocalDate(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }
  function weekIndexOf(date) {
    return Math.floor((date - startDate) / WEEK);
  }
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (x) => String(x).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function fmtDur(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtTime(d) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function nameOf(pid) {
    const p = participants.find((x) => x.id === pid);
    return p ? p.name : "Unknown";
  }

  /* ---------------------------------------------------------------
   *  Rules engine — decide which workouts count and total earnings
   * ------------------------------------------------------------- */
  const STATUS = {
    counted: { label: "+$" + RULES.dollars, cls: "b-counted" },
    too_short: { label: "Under " + RULES.minDurationSec / 60 + " min", cls: "b-short" },
    too_soon: { label: "Within " + CFG.MIN_GAP_HOURS + "h of last", cls: "b-soon" },
    weekly_cap: { label: "Weekly cap reached", cls: "b-cap" },
    out_of_period: { label: "Outside dates", cls: "b-out" },
    sick: { label: "Sick day", cls: "b-sick" },
  };

  function analyze(pid) {
    const list = workouts
      .filter((w) => w.participant_id === pid)
      .slice()
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    let lastCountedEnd = null;
    const weekCounts = {};
    let earned = 0;
    let countedCount = 0;
    let sickUsed = 0;

    const rows = list.map((w) => {
      const start = new Date(w.started_at);
      const end = new Date(w.ended_at);
      const wi = weekIndexOf(start);
      let status;
      let earns = 0;

      if (w.is_sick_day) {
        status = "sick";
        sickUsed++;
      } else if (start < startDate || start >= endDate) {
        status = "out_of_period";
      } else if (w.duration_seconds < RULES.minDurationSec) {
        status = "too_short";
      } else if (lastCountedEnd && start - lastCountedEnd < RULES.minGapMs) {
        status = "too_soon";
      } else if ((weekCounts[wi] || 0) >= RULES.maxPerWeek) {
        status = "weekly_cap";
      } else {
        status = "counted";
        earns = RULES.dollars;
        earned += earns;
        countedCount++;
        weekCounts[wi] = (weekCounts[wi] || 0) + 1;
        lastCountedEnd = end;
      }
      return Object.assign({}, w, { status, earns, weekIndex: wi });
    });

    const currentWeek = clamp(weekIndexOf(new Date()), 0, totalWeeks - 1);
    return {
      pid,
      earned,
      countedCount,
      total: list.length,
      sickUsed,
      currentWeekCounted: weekCounts[currentWeek] || 0,
      rows,
    };
  }

  function standings() {
    return participants
      .map((p) => ({ p, s: analyze(p.id) }))
      .sort((a, b) => b.s.earned - a.s.earned || b.s.countedCount - a.s.countedCount);
  }

  /* ---------------------------------------------------------------
   *  Data
   * ------------------------------------------------------------- */
  async function loadData() {
    if (!sb) return;
    const [pRes, wRes] = await Promise.all([
      sb.from("participants").select("*").order("created_at"),
      sb.from("workouts").select("*"),
    ]);
    if (pRes.error || wRes.error) {
      loadError = (pRes.error || wRes.error).message;
      console.error(pRes.error || wRes.error);
      renderAll();
      return;
    }
    loadError = null;
    participants = pRes.data || [];
    workouts = wRes.data || [];
    loaded = true;
    renderAll();
  }

  async function logWorkout({ startedAt, endedAt, type, sick }) {
    const duration = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    const { error } = await sb.from("workouts").insert({
      participant_id: me,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_seconds: duration,
      type: (type || "").trim() || "Workout",
      is_sick_day: !!sick,
    });
    if (error) {
      alert("Could not save: " + error.message);
      return false;
    }
    await loadData();
    return true;
  }

  async function deleteWorkout(id) {
    if (!confirm("Delete this workout?")) return;
    const { error } = await sb.from("workouts").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadData();
    // refresh the open drilldown
    if (currentDetailPid) openDetail(currentDetailPid);
  }

  async function addMate(name) {
    name = name.trim();
    if (!name) return;
    const { data, error } = await sb.from("participants").insert({ name }).select().single();
    if (error) return alert(error.message);
    await loadData();
    selectMe(data.id);
  }

  /* ---------------------------------------------------------------
   *  Identity
   * ------------------------------------------------------------- */
  function selectMe(pid) {
    me = pid;
    localStorage.setItem("wc_me", pid);
    renderAll();
  }
  function switchUser() {
    if (!confirm("Switch to a different mate on this device?")) return;
    localStorage.removeItem("wc_me");
    me = null;
    renderAll();
  }

  function renderIdentity() {
    const box = $("identityList");
    box.innerHTML = "";
    participants.forEach((p) => {
      const b = document.createElement("button");
      b.className = "pick";
      b.innerHTML = avatarHtml(p.name, "lg") + `<span>${escapeHtml(p.name)}</span>`;
      b.onclick = () => selectMe(p.id);
      box.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------
   *  Timer
   * ------------------------------------------------------------- */
  function activeTimer() {
    try {
      return JSON.parse(localStorage.getItem("wc_timer") || "null");
    } catch {
      return null;
    }
  }
  function startTimer() {
    if (!me) return;
    localStorage.setItem("wc_timer", JSON.stringify({ pid: me, startedAt: Date.now() }));
    renderTimer();
  }
  function discardTimer() {
    localStorage.removeItem("wc_timer");
    renderTimer();
  }
  function stopTimer() {
    const t = activeTimer();
    if (!t) return;
    const started = new Date(t.startedAt);
    const ended = new Date();
    const dur = (ended - started) / 1000;
    $("logDuration").textContent = fmtClock(dur);
    $("logWarn").classList.toggle("hidden", dur >= RULES.minDurationSec);
    $("logType").value = "";
    openOverlay("logModal");
    $("logSave").onclick = async () => {
      const ok = await logWorkout({ startedAt: started, endedAt: ended, type: $("logType").value });
      if (ok) {
        discardTimer();
        closeOverlay();
      }
    };
  }
  function renderTimer() {
    const t = activeTimer();
    const running = t && t.pid === me;
    const disp = $("timerDisplay");
    $("startBtn").classList.toggle("hidden", !!running);
    $("stopBtn").classList.toggle("hidden", !running);
    $("discardBtn").classList.toggle("hidden", !running);

    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    if (running) {
      const update = () => {
        const sec = (Date.now() - t.startedAt) / 1000;
        disp.textContent = fmtClock(sec);
        const qualifies = sec >= RULES.minDurationSec;
        disp.classList.toggle("qualifies", qualifies);
        disp.classList.toggle("running", !qualifies);
        $("timerHint").textContent = qualifies
          ? "✅ Counts now — stop whenever you're done."
          : "Min " + fmtClock(RULES.minDurationSec) + " to count.";
      };
      update();
      tick = setInterval(update, 250);
    } else {
      disp.textContent = "00:00";
      disp.classList.remove("qualifies", "running");
      $("timerHint").textContent = "Tap start when you begin. Min " + fmtClock(RULES.minDurationSec) + " to count.";
    }
  }

  /* ---------------------------------------------------------------
   *  Overlays
   * ------------------------------------------------------------- */
  function openOverlay(modalId) {
    overlay.classList.remove("hidden");
    ["logModal", "manualModal", "sickModal", "detailModal"].forEach((m) =>
      $(m).classList.toggle("hidden", m !== modalId)
    );
  }
  function closeOverlay() {
    overlay.classList.add("hidden");
  }

  function openManual() {
    const now = new Date();
    $("mDate").value = toDateInput(now);
    $("mTime").value = toTimeInput(now);
    $("mMins").value = 30;
    $("mType").value = "";
    openOverlay("manualModal");
  }
  function openSick() {
    $("sDate").value = toDateInput(new Date());
    $("sType").value = "";
    openOverlay("sickModal");
  }
  function toDateInput(d) {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function toTimeInput(d) {
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------------------------------------------------------
   *  Drilldown
   * ------------------------------------------------------------- */
  let currentDetailPid = null;
  function openDetail(pid) {
    currentDetailPid = pid;
    const s = analyze(pid);
    $("detailName").innerHTML = avatarHtml(nameOf(pid), "lg") + `<span>${escapeHtml(nameOf(pid))}</span>`;
    $("detailSummary").innerHTML = `
      <span><b>$${s.earned}</b>earned</span>
      <span><b>${s.countedCount}</b>counted</span>
      <span><b>${s.total}</b>logged</span>
      <span><b>${s.sickUsed}/${RULES.sickAllowance}</b>sick days</span>`;

    const list = $("detailList");
    if (!s.rows.length) {
      list.innerHTML = `<p class="muted center">No workouts logged yet.</p>`;
    } else {
      list.innerHTML = "";
      s.rows
        .slice()
        .reverse()
        .forEach((w) => {
          const start = new Date(w.started_at);
          const st = STATUS[w.status];
          const row = document.createElement("div");
          row.className = "w-row";
          const meta = w.is_sick_day
            ? fmtDate(start)
            : `${fmtDate(start)} · ${fmtTime(start)} · ${fmtDur(w.duration_seconds)}`;
          row.innerHTML = `
            <div>
              <div class="w-type">${escapeHtml(w.type)}</div>
              <div class="w-meta">${meta}</div>
            </div>
            <div class="w-right">
              <span class="badge ${st.cls}">${st.label}</span>
              ${pid === me ? `<button class="w-del" data-del="${w.id}" title="Delete">🗑</button>` : ""}
            </div>`;
          list.appendChild(row);
        });
      list.querySelectorAll("[data-del]").forEach((b) => {
        b.onclick = () => deleteWorkout(b.getAttribute("data-del"));
      });
    }
    openOverlay("detailModal");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function initialsOf(name) {
    return String(name || "?").trim().charAt(0).toUpperCase();
  }
  function avatarHtml(name, cls) {
    const map = CFG.AVATARS || {};
    const src = map[name] || "avatars/" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "") + ".jpg";
    const pos = (CFG.AVATAR_POS || {})[name] || "center top";
    return (
      `<span class="avatar ${cls || ""}">` +
      `<span class="avatar-i">${escapeHtml(initialsOf(name))}</span>` +
      `<img src="${escapeHtml(src)}" alt="" style="object-position:${escapeHtml(pos)}" onerror="this.remove()">` +
      `</span>`
    );
  }

  /* ---------------------------------------------------------------
   *  Render
   * ------------------------------------------------------------- */
  function renderHeader() {
    const now = new Date();
    const week = clamp(weekIndexOf(now) + 1, 1, totalWeeks);
    const daysLeft = Math.max(0, Math.ceil((endDate - now) / DAY));
    let msg;
    if (now < startDate) msg = "Starts " + fmtDate(startDate);
    else if (now >= endDate) msg = "Challenge complete 🎉";
    else msg = `Week ${week} of ${totalWeeks} · ${daysLeft} days left`;
    $("challengeProgress").textContent = msg;

    const who = $("whoami");
    if (me && participants.some((p) => p.id === me)) {
      who.innerHTML = avatarHtml(nameOf(me), "sm") + `<span>${escapeHtml(nameOf(me))}</span>`;
      who.classList.remove("hidden");
      who.onclick = switchUser;
    } else {
      who.classList.add("hidden");
    }
  }

  function renderWeekChip() {
    if (!me) return;
    const s = analyze(me);
    $("weekChip").textContent = `This week: ${s.currentWeekCounted}/${RULES.maxPerWeek}`;
  }

  function renderLeaderboard() {
    const box = $("leaderboard");
    const rows = standings();
    const max = Math.max(1, rows[0] ? rows[0].s.earned : 1);
    const medals = ["🥇", "🥈", "🥉"];
    box.innerHTML = "";
    rows.forEach((r, i) => {
      // Standard competition ranking: anyone on the same money shares a place,
      // and the next person skips ahead (e.g. 1, 1, 3 — not 1, 2, 3).
      const rank = rows.filter((o) => o.s.earned > r.s.earned).length + 1;
      const el = document.createElement("div");
      el.className = "lb-row" + (r.p.id === me ? " me" : "");
      el.onclick = () => openDetail(r.p.id);
      el.innerHTML = `
        <div class="lb-rank">${medals[rank - 1] || rank}</div>
        ${avatarHtml(r.p.name)}
        <div class="lb-main">
          <div class="lb-name">${escapeHtml(r.p.name)}${r.p.id === me ? " (you)" : ""}</div>
          <div class="lb-sub">${r.s.countedCount} workouts · this week ${r.s.currentWeekCounted}/${RULES.maxPerWeek}</div>
          <div class="bar"><i style="width:${(r.s.earned / max) * 100}%"></i></div>
        </div>
        <div class="lb-money">$${r.s.earned}</div>`;
      box.appendChild(el);
    });
  }

  // "Jake" · "Jake & Trent" · "Jake, Trent & Mitchell"
  function joinNames(names) {
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return names[0] + " & " + names[1];
    return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  }

  function renderPayout() {
    const box = $("payout");
    const rows = standings();
    if (rows.length < 2) {
      box.innerHTML = `<p class="muted">Add at least two mates to see the payout.</p>`;
      return;
    }
    const topEarned = rows[0].s.earned;
    const bottomEarned = rows[rows.length - 1].s.earned;
    const diff = topEarned - bottomEarned;
    const leaders = rows.filter((r) => r.s.earned === topEarned);
    const leaderNames = joinNames(leaders.map((r) => escapeHtml(r.p.name)));

    let html;
    if (diff === 0) {
      // Whole group is level — don't crown any single person.
      html = `<p class="lead">🤝 Everyone's level on <b>$${topEarned}</b> — no one owes anything yet.</p>`;
    } else {
      const verb = leaders.length > 1 ? "lead" : "leads";
      html = `<p class="lead">🏆 <b>${leaderNames}</b> ${verb} with <b>$${topEarned}</b>.</p>`;
      html += `<p>By the agreement, the lowest pays the difference to the top:</p>`;
      rows
        .filter((r) => r.s.earned === bottomEarned)
        .forEach((l) => {
          html += `<div class="payout-row"><span>${escapeHtml(l.p.name)} → ${leaderNames}</span><span class="owes">$${diff}</span></div>`;
        });
    }
    if (rows.length > 2 && diff !== 0) {
      html += `<p class="muted small" style="margin-top:14px">Each mate's gap to the leader (handy if you'd rather everyone settle up to the winner):</p>`;
      rows.forEach((r) => {
        const g = topEarned - r.s.earned;
        html += `<div class="payout-row"><span>${escapeHtml(r.p.name)}</span><span>${g === 0 ? "leading" : "$" + g + " behind"}</span></div>`;
      });
    }
    box.innerHTML = html;
  }

  function renderRules() {
    const ul = $("rulesList");
    ul.innerHTML = [
      `A workout must last at least <b>${RULES.minDurationSec / 60} minutes</b>.`,
      `At least <b>${CFG.MIN_GAP_HOURS} hours</b> must pass between workouts that count.`,
      `Up to <b>${RULES.maxPerWeek} workouts a week</b> earn money — extras are encouraged but pay $0.`,
      `Each counting workout earns <b>$${RULES.dollars}</b> (max $${RULES.dollars * RULES.maxPerWeek}/week).`,
      `<b>${RULES.sickAllowance} sick/recovery days</b> across the challenge — they don't earn but aren't penalised.`,
      `At the end, the lowest total pays the difference to the highest. Honour system — no dodgy counting!`,
    ]
      .map((t) => `<li>${t}</li>`)
      .join("");
  }

  function renderAll() {
    renderHeader();
    if (!sb) {
      $("setupBanner").classList.remove("hidden");
      $("identity").classList.add("hidden");
      $("app").classList.add("hidden");
      return;
    }
    // Connected, but the data load failed (usually: schema.sql not run yet).
    if (loadError && !loaded) {
      const b = $("setupBanner");
      b.innerHTML =
        `<h2>⚠️ Can't load data yet</h2>` +
        `<p>Connected to Supabase, but the database isn't ready:</p>` +
        `<p><code>${escapeHtml(loadError)}</code></p>` +
        `<p>If you haven't run <code>schema.sql</code> in the Supabase SQL Editor yet, do that and reload this page.</p>`;
      b.classList.remove("hidden");
      $("identity").classList.add("hidden");
      $("app").classList.add("hidden");
      return;
    }
    $("setupBanner").classList.add("hidden");

    // Wait for the first data load before deciding identity vs app, so a
    // remembered user isn't wiped before the participant list arrives.
    if (!loaded) {
      $("identity").classList.add("hidden");
      $("app").classList.add("hidden");
      return;
    }

    const validMe = me && participants.some((p) => p.id === me);
    if (!validMe) {
      if (me) {
        me = null;
        localStorage.removeItem("wc_me");
      }
      renderIdentity();
      $("identity").classList.remove("hidden");
      $("app").classList.add("hidden");
      return;
    }
    $("identity").classList.add("hidden");
    $("app").classList.remove("hidden");
    renderWeekChip();
    renderTimer();
    renderLeaderboard();
    renderPayout();
    renderRules();
  }

  /* ---------------------------------------------------------------
   *  Wire up events
   * ------------------------------------------------------------- */
  function wire() {
    $("startBtn").onclick = startTimer;
    $("stopBtn").onclick = stopTimer;
    $("discardBtn").onclick = () => {
      if (confirm("Discard this timer?")) discardTimer();
    };
    $("manualBtn").onclick = openManual;
    $("sickBtn").onclick = openSick;
    $("refreshBtn").onclick = loadData;

    $("manualSave").onclick = async () => {
      const date = $("mDate").value;
      const time = $("mTime").value || "12:00";
      const mins = Math.max(1, parseInt($("mMins").value, 10) || 0);
      if (!date) return alert("Pick a date.");
      const started = new Date(`${date}T${time}`);
      const ended = new Date(started.getTime() + mins * 60000);
      const ok = await logWorkout({ startedAt: started, endedAt: ended, type: $("mType").value });
      if (ok) closeOverlay();
    };

    $("sickSave").onclick = async () => {
      const date = $("sDate").value;
      if (!date) return alert("Pick a date.");
      const at = new Date(`${date}T12:00`);
      const ok = await logWorkout({
        startedAt: at,
        endedAt: at,
        type: $("sType").value || "Sick / recovery day",
        sick: true,
      });
      if (ok) closeOverlay();
    };

    $("addMateForm").onsubmit = (e) => {
      e.preventDefault();
      addMate($("addMateName").value);
      $("addMateName").value = "";
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.classList.contains("close-overlay")) closeOverlay();
    });
  }

  /* ---------------------------------------------------------------
   *  Init
   * ------------------------------------------------------------- */
  function init() {
    wire();
    renderAll();
    if (!sb) return;
    loadData();
    sb.channel("wc-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "workouts" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, loadData)
      .subscribe();
  }

  init();
})();
