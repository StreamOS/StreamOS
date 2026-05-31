const STORAGE_KEY = "streamos.workspace.v2";

const marketData = [
  { label: "YouTube", value: 14.83, color: "#00d4aa" },
  { label: "TikTok", value: 8.0, color: "#9b5cff" },
  { label: "Twitch", value: 4.64, color: "#ff4e6a" },
  { label: "Kick", value: 1.1, color: "#f5c842" },
  { label: "Sonstige", value: 0.8, color: "rgba(255,255,255,0.35)" }
];

const painData = [
  { label: "Discoverability", value: 9.5, color: "#ff4e6a" },
  { label: "Monetarisierung", value: 9.0, color: "#f5c842" },
  { label: "Burnout", value: 8.5, color: "#9b5cff" },
  { label: "Multi-Plattform", value: 8.0, color: "#48a4ff" },
  { label: "Branding", value: 7.5, color: "#00d4aa" },
  { label: "Analytics", value: 7.0, color: "rgba(255,255,255,0.35)" }
];

const defaultState = {
  profile: {
    creatorName: "NovaPlays",
    niche: "Tactical FPS & Community Challenges",
    goal: "Mehr Zuschauer",
    weeklyHours: 18,
    positioning: "Kompetitive Streams mit klaren Lernmomenten, schnellen Highlights und starker Community-Interaktion."
  },
  platforms: [
    { name: "Twitch", connected: true, followers: 18420, status: "EventSub aktiv" },
    { name: "YouTube", connected: true, followers: 9200, status: "Analytics aktiv" },
    { name: "TikTok", connected: false, followers: 6100, status: "OAuth offen" },
    { name: "Kick", connected: false, followers: 1200, status: "Beta Connector" }
  ],
  clips: [
    { id: 1, title: "Bossfight Clutch in Overtime", platform: "TikTok + Shorts", score: 94, status: "bereit", hook: "Ich hatte nur noch 1 HP..." },
    { id: 2, title: "Chat rastet nach Comeback aus", platform: "Reels", score: 88, status: "geplant", hook: "Niemand hat an diesen Run geglaubt." }
  ],
  money: [
    { id: 1, source: "Subs", amount: 420, note: "Subathon Push" },
    { id: 2, source: "Sponsoring", amount: 1200, note: "Hardware Brand Integration" },
    { id: 3, source: "Merch", amount: 310, note: "Drop nach Community Stream" }
  ],
  events: [
    { id: 1, type: "stream.online", text: "Twitch Stream gestartet", time: "09:04" },
    { id: 2, type: "channel.follow", text: "12 neue Follower seit Streamstart", time: "09:42" },
    { id: 3, type: "channel.cheer", text: "Bits Spike nach Bossfight erkannt", time: "10:16" }
  ],
  brand: {
    title: "Stream Starting",
    subtitle: "Neon Tactical · high contrast · chat ready",
    colors: ["#9b5cff", "#00d4aa", "#ff4e6a", "#f5c842"]
  },
  plan: [
    { day: "Mo", type: "Stream", detail: "Ranked Push", tone: "active" },
    { day: "Di", type: "Edit", detail: "Shorts Batch", tone: "" },
    { day: "Mi", type: "Rest", detail: "Recovery", tone: "rest" },
    { day: "Do", type: "Stream", detail: "Collab", tone: "active" },
    { day: "Fr", type: "Drop", detail: "Merch + Clips", tone: "" },
    { day: "Sa", type: "Rest", detail: "Offline", tone: "rest" },
    { day: "So", type: "Review", detail: "Analytics", tone: "" }
  ],
  range: 7
};

let state = loadState();

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...structuredClone(defaultState), ...stored } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function euro(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function routeTo(route) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === route));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === route));
  const titleMap = {
    dashboard: "StreamOS Command Center",
    onboarding: "Creator Onboarding",
    platforms: "Multi-Plattform Management",
    clips: "AI Clip Engine",
    analytics: "StreamIQ Analytics",
    money: "Monetarisierungs-Dashboard",
    branding: "AI Branding Studio",
    planner: "Planner & Burnout-Schutz",
    settings: "Settings"
  };
  document.querySelector("#pageTitle").textContent = titleMap[route] || "StreamOS";
  window.location.hash = route;
}

function renderBars(containerId, data, maxValue = Math.max(...data.map((item) => item.value))) {
  const container = document.querySelector(containerId);
  container.innerHTML = data.map((item) => `
    <div class="bar-row">
      <strong>${item.label}</strong>
      <div class="bar-track"><div class="bar-fill" style="--value:${(item.value / maxValue) * 100}%;--color:${item.color}"></div></div>
      <span>${item.value}</span>
    </div>
  `).join("");
}

function renderLineChart() {
  const growthLine = document.querySelector("#growthLine");
  const range = Number(state.range);
  const labels = range === 7 ? 7 : range === 30 ? 10 : 12;
  const viewers = Array.from({ length: labels }, (_, index) => 400 + index * (range * 9) + Math.round(Math.sin(index) * 120));
  const revenue = Array.from({ length: labels }, (_, index) => 500 + index * (range * 17) + state.money.length * 90);
  const maxViewers = Math.max(...viewers);
  const maxRevenue = Math.max(...revenue);

  function points(items, max, offset) {
    return items.map((value, index) => {
      const x = (index / (items.length - 1)) * 100;
      const y = 92 - (value / max) * 74 + offset;
      return `${x},${Math.max(8, Math.min(92, y))}`;
    }).join(" ");
  }

  growthLine.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Viewer und Umsatz Entwicklung">
      <polyline points="${points(viewers, maxViewers, 2)}" fill="none" stroke="#9b5cff" stroke-width="2.4" vector-effect="non-scaling-stroke"></polyline>
      <polyline points="${points(revenue, maxRevenue, -4)}" fill="none" stroke="#00d4aa" stroke-width="2.4" vector-effect="non-scaling-stroke"></polyline>
    </svg>
  `;
}

function getScores() {
  const connectedCount = state.platforms.filter((platform) => platform.connected).length;
  const clipBoost = Math.min(20, state.clips.length * 3);
  const discoverability = Math.min(96, 44 + connectedCount * 8 + clipBoost);
  const moneyTotal = state.money.reduce((sum, item) => sum + Number(item.amount), 0);
  const burnout = Math.min(88, Math.max(18, Number(state.profile.weeklyHours) * 2 + state.clips.length * 2 - connectedCount * 3));
  return { connectedCount, discoverability, moneyTotal, burnout };
}

function renderDashboard() {
  const scores = getScores();
  document.querySelector("#sidebarProfile").textContent = `${state.profile.creatorName} · ${state.profile.niche}`;
  document.querySelector("#heroStatus").textContent = `${scores.connectedCount} Plattformen verbunden`;
  document.querySelector("#pipelineClips").textContent = state.clips.length;
  document.querySelector("#pipelinePosts").textContent = Math.max(0, state.clips.filter((clip) => clip.status !== "archiviert").length);
  document.querySelector("#pipelineSponsors").textContent = Math.max(1, Math.round(scores.moneyTotal / 700));
  document.querySelector("#kpiDiscoverability").textContent = scores.discoverability;
  document.querySelector("#kpiMrr").textContent = euro(scores.moneyTotal);
  document.querySelector("#kpiBurnout").textContent = `${scores.burnout}%`;

  const tasks = [
    `SEO-Titel fuer ${state.profile.niche} mit klarer Hook schreiben`,
    `${Math.min(5, Math.max(2, state.clips.length))} beste Clips fuer Shorts und TikTok einplanen`,
    scores.connectedCount < 4 ? "Offene Plattformen verbinden, damit Repurposing vollstaendig ist" : "EventSub Feed und Upload Zeiten beobachten",
    scores.burnout > 55 ? "Recovery Slot in den Wochenplan setzen" : "Sponsor Pitch aus Top-Clip Performance bauen"
  ];
  document.querySelector("#priorityList").innerHTML = tasks.map((task) => `<li><span></span>${task}</li>`).join("");
}

function renderPlatforms() {
  document.querySelector("#platformGrid").innerHTML = state.platforms.map((platform, index) => `
    <article class="platform-card ${platform.connected ? "connected" : ""}">
      <div>
        <strong>${platform.name}</strong>
        <p>${platform.followers.toLocaleString("de-DE")} Follower · ${platform.status}</p>
      </div>
      <button class="${platform.connected ? "ghost-button" : "primary-button"} compact" type="button" data-platform="${index}">
        ${platform.connected ? "Trennen" : "Verbinden"}
      </button>
    </article>
  `).join("");
}

function renderClips() {
  const list = document.querySelector("#clipList");
  if (!state.clips.length) {
    list.innerHTML = `<div class="empty-state">Noch keine Clips. Starte eine VOD-Analyse.</div>`;
    return;
  }
  list.innerHTML = state.clips.map((clip) => `
    <article class="clip-row">
      <div>
        <b>${clip.title}</b>
        <small>${clip.hook}</small>
      </div>
      <span>Hook ${clip.score}</span>
      <small>${clip.platform} · ${clip.status}</small>
    </article>
  `).join("");
}

function renderMoney() {
  const total = state.money.reduce((sum, item) => sum + Number(item.amount), 0);
  document.querySelector("#moneyTotal").textContent = euro(total);
  document.querySelector("#moneyList").innerHTML = state.money.map((item) => `
    <div class="money-row">
      <div><strong>${item.source}</strong><small>${item.note}</small></div>
      <span>${euro(item.amount)}</span>
    </div>
  `).join("");
}

function renderBrand() {
  document.querySelector("#brandTitle").textContent = state.brand.title;
  document.querySelector("#brandSubtitle").textContent = state.brand.subtitle;
  document.querySelector("#palette").innerHTML = state.brand.colors.map((color) => `<span style="--swatch:${color}"></span>`).join("");
  document.querySelector("#overlayPreview").style.setProperty("--brand-main", state.brand.colors[0]);
}

function renderPlanner() {
  document.querySelector("#calendarBoard").innerHTML = state.plan.map((day) => `
    <div class="day ${day.tone}">
      <b>${day.day}</b>
      <span>${day.type}</span>
      <small>${day.detail}</small>
    </div>
  `).join("");
}

function renderEvents() {
  document.querySelector("#eventFeed").innerHTML = state.events.slice(0, 7).map((event) => `
    <div class="event-row">
      <span>${event.type}</span>
      <strong>${event.text}</strong>
      <small>${event.time}</small>
    </div>
  `).join("");
}

function renderInsights() {
  const scores = getScores();
  const insights = [
    { title: "Bester Wachstumspfad", body: `${state.profile.niche}: Shorts aus High-Chat-Momenten vor Live-Reminder posten.` },
    { title: "Monetarisierung", body: scores.moneyTotal > 1500 ? "Creator-Pro Preisanker ist plausibel. Sponsor-Pipeline priorisieren." : "Subs und Merch erst stabilisieren, Sponsoring danach starten." },
    { title: "Risiko", body: scores.burnout > 55 ? "Wochenstunden reduzieren oder Batch-Content staerker automatisieren." : "Content-Last aktuell tragbar. Review-Slot beibehalten." }
  ];
  document.querySelector("#insightGrid").innerHTML = insights.map((insight) => `
    <article class="insight-card"><strong>${insight.title}</strong><p>${insight.body}</p></article>
  `).join("");
}

function renderAll() {
  renderBars("#marketBars", marketData);
  renderBars("#painBars", painData, 10);
  renderLineChart();
  renderDashboard();
  renderPlatforms();
  renderClips();
  renderMoney();
  renderBrand();
  renderPlanner();
  renderEvents();
  renderInsights();
}

document.querySelectorAll("[data-route]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    routeTo(link.dataset.route);
  });
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => routeTo(button.dataset.jump));
});

document.querySelector("#profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.profile = { ...state.profile, ...data, weeklyHours: Number(data.weeklyHours) };
  saveState();
  renderAll();
  showToast("Profil gespeichert. StreamOS Empfehlungen wurden aktualisiert.");
});

document.querySelector("#platformGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-platform]");
  if (!button) return;
  const platform = state.platforms[Number(button.dataset.platform)];
  platform.connected = !platform.connected;
  platform.status = platform.connected ? "Demo OAuth verbunden" : "OAuth offen";
  state.events.unshift({ id: Date.now(), type: "platform.update", text: `${platform.name} ${platform.connected ? "verbunden" : "getrennt"}`, time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
  saveState();
  renderAll();
});

document.querySelector("#clipForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const baseScore = data.chatEnergy === "hoch" ? 88 : data.chatEnergy === "mittel" ? 78 : 68;
  const titles = ["Opening Hook", "Chat Peak", "Comeback Moment", "Reaction Clip", "Final Push"];
  const generated = titles.map((title, index) => ({
    id: Date.now() + index,
    title: `${title}: ${data.streamTitle}`,
    platform: index % 2 === 0 ? "TikTok + Shorts" : "Reels + Twitch",
    score: Math.min(98, baseScore + Math.round(Math.random() * 9) - index),
    status: index < 2 ? "bereit" : "geplant",
    hook: `${data.category || "Stream"} Moment bei Minute ${Math.round((Number(data.duration) / 6) * (index + 1))}`
  }));
  state.clips = [...generated, ...state.clips].slice(0, 12);
  state.events.unshift({ id: Date.now(), type: "clip.created", text: `${generated.length} neue Clip-Kandidaten erkannt`, time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
  saveState();
  renderAll();
  showToast("VOD analysiert. Clip-Kandidaten wurden erzeugt.");
});

document.querySelector("#moneyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.money.unshift({ id: Date.now(), source: data.source, amount: Number(data.amount), note: data.note || "Manueller Eintrag" });
  saveState();
  renderAll();
  showToast("Monetarisierungs-Eintrag gespeichert.");
});

document.querySelector("#brandForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.brand = {
    title: `${state.profile.creatorName} Live`,
    subtitle: `${data.style} · ${data.vibe || "creator-first"} · export ready`,
    colors: [data.color, "#00d4aa", "#ff4e6a", "#f5c842"]
  };
  saveState();
  renderAll();
  showToast("Brand Kit generiert.");
});

document.querySelector("#rangeSwitch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  state.range = Number(button.dataset.range);
  document.querySelectorAll("#rangeSwitch button").forEach((item) => item.classList.toggle("active", item === button));
  saveState();
  renderLineChart();
});

document.querySelector("#generatePlan").addEventListener("click", () => {
  const highLoad = Number(state.profile.weeklyHours) > 25 || state.clips.length > 8;
  state.plan = [
    { day: "Mo", type: "Stream", detail: state.profile.niche.split("&")[0].trim(), tone: "active" },
    { day: "Di", type: "Clips", detail: "Batch Export", tone: "" },
    { day: "Mi", type: highLoad ? "Rest" : "Edit", detail: highLoad ? "Recovery" : "Shorts", tone: highLoad ? "rest" : "" },
    { day: "Do", type: "Stream", detail: "Community", tone: "active" },
    { day: "Fr", type: "Money", detail: "Sponsor Pitch", tone: "" },
    { day: "Sa", type: "Rest", detail: "Offline", tone: "rest" },
    { day: "So", type: "Review", detail: "StreamIQ", tone: "" }
  ];
  saveState();
  renderAll();
  showToast("Wochenplan optimiert.");
});

document.querySelector("#simulateEvent").addEventListener("click", () => {
  const events = [
    ["channel.follow", "Neue Follower-Welle nach Shorts Upload"],
    ["channel.subscribe", "3 neue Subs im Live-Block"],
    ["channel.raid", "Raid erkannt: Community Peak moeglich"],
    ["channel.update", "Titel-Update mit besserem Keyword gespeichert"]
  ];
  const event = events[Math.floor(Math.random() * events.length)];
  state.events.unshift({ id: Date.now(), type: event[0], text: event[1], time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
  saveState();
  renderAll();
});

document.querySelector("#runAudit").addEventListener("click", () => {
  renderAll();
  showToast("AI Audit abgeschlossen: Clips, Umsatz, Branding und Planner aktualisiert.");
});

document.querySelector("#clearClips").addEventListener("click", () => {
  state.clips = [];
  saveState();
  renderAll();
});

document.querySelector("#exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "streamos-workspace.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#seedDemo").addEventListener("click", () => {
  state = structuredClone(defaultState);
  saveState();
  renderAll();
  showToast("Demo-Daten neu geladen.");
});

document.querySelector("#resetData").addEventListener("click", () => {
  if (!confirm("Lokale StreamOS Demo-Daten wirklich loeschen?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  renderAll();
  showToast("Lokale Daten geloescht. Demo-Zustand wiederhergestellt.");
});

window.addEventListener("hashchange", () => routeTo(location.hash.replace("#", "") || "dashboard"));

renderAll();
routeTo(location.hash.replace("#", "") || "dashboard");
