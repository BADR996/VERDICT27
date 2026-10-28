import { $, $$, S, api, voterToken } from "./util.js";
import { initPolls } from "./polls.js";
import { initEvo } from "./evo.js";
import { initDuels } from "./duels.js";
import { initQuiz } from "./quiz.js";
import { initContrib } from "./contrib.js";
import { initDemo } from "./demo.js";
import { initAds } from "./ads.js";
import { initActu } from "./actu.js";
import { initNews } from "./news.js";
import { initAlerts } from "./alerts.js";
import { toast } from "./util.js";

async function boot() {
  S.voter = voterToken();
  const [polls, config, votes, stats, site] = await Promise.all([
    api("/api/polls"), api("/api/quiz/config"),
    api("/api/votes?voter=" + encodeURIComponent(S.voter)).catch(() => ({ tallies: {}, mine: {} })),
    api("/api/stats").catch(() => null), api("/api/site").catch(() => ({})),
  ]);
  Object.assign(S, { polls, config, votes, stats });

  if (site.heroPhoto) { $("#hero").style.setProperty("--hero-photo", `url("${site.heroPhoto}")`); $("#hero").classList.add("has-photo"); }

  initPolls(); initEvo(); initDuels(); initContrib(); initQuiz(); initNews(); initAlerts(site); initDemo(); initAds(site); initActu();
  if (new URLSearchParams(location.search).get("abonnement") === "confirme") {
    toast("Inscription confirmée : vous recevrez l'alerte une fois par mois.");
    history.replaceState(null, "", "/");
  }
  navSpy();
}

function navSpy() {
  const links = $$(".topbar nav a[href^='#']");
  const map = new Map(links.map(a => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a === map.get(e.target.id)));
  }), { rootMargin: "-40% 0px -55% 0px" });
  map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });

  const cta = $("#cta-float"), test = $("#test");
  if (cta && test) new IntersectionObserver(es => { cta.classList.toggle("hide", es[0].isIntersecting); }, { threshold: .05 }).observe(test);
}

boot().catch(e => {
  console.error(e);
  const m = document.getElementById("polls-meta");
  if (m) m.textContent = "Le site n'a pas pu charger ses données. Rechargez la page.";
});
