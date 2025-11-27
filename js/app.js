/* =========================
   Rețete de Mâncare — app.js (upgradat)
   - 10 rețete standard
   - Sistem de credite (demo)
   - Pro (nelimitat) activat prin checkout demo cu card
   - Pachet 10 credite, cu card demo
   - Rețete AI salvate + copiere
   ========================= */

/* -------- Helpers -------- */
const $ = (id) => document.getElementById(id);

// Inline SVG (nu depind de lucide.createIcons)
const SVG_TIMER = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  style="display:inline-block;vertical-align:-2px"><path d="M10 2h4"/><path d="M12 14v-4"/><path d="M7 4h10"/><path d="M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"/></svg>`;
const SVG_USERS = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  style="display:inline-block;vertical-align:-2px"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

/* -------- Config Cerebras din js/config.js --------
   Necesare: CEREBRAS_API_KEY, CEREBRAS_URL, CEREBRAS_MODEL, SYSTEM_RULES
--------------------------------------------------- */

/* -------- Stare (demo; ne-persistentă) -------- */
const state = {
  credits: 3,          // 3 gratuite pe sesiune
  isPro: false,        // Pro off la început
  lastRecipe: { title: "", body: "", servings: "", time: "" },
  savedRecipes: []     // rețete AI salvate local (în memorie)
};

/* Planuri de pricing (pentru modal) */
const PLANS = {
  pack10: {
    id: "pack10",
    name: "Pachet 10 credite",
    priceLabel: "3,99 € demo",
    credits: 10,
    makesPro: false
  },
  pro: {
    id: "pro",
    name: "Pro – 1 lună",
    priceLabel: "9,99 € demo",
    credits: 0,
    makesPro: true
  }
};
let currentPlan = "pack10";

/* -------- Toast notifications -------- */
function showToast(message, type = "success") {
  const root = $("toastRoot");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${message}</span>`;
  root.appendChild(el);

  // auto-remove
  setTimeout(() => {
    el.classList.add("toast-hide");
    setTimeout(() => {
      el.remove();
    }, 250);
  }, 3500);
}

/* -------- UI cont / credite -------- */
function refreshAccountUI() {
  const label = $("creditsLabel");
  const badge = $("accountBadge");
  if (state.isPro) {
    label.textContent = "Pro activ";
    badge?.classList.add("chip-pro");
  } else {
    label.textContent = `${state.credits} credite`;
    badge?.classList.remove("chip-pro");
  }

  // Butoane planuri
  const getFree = $("getFree");
  const goPro = $("goPro");
  if (getFree) {
    getFree.disabled = false;
    getFree.innerHTML = !state.isPro
      ? `<i data-lucide="check"></i> Ești pe planul acesta`
      : `<i data-lucide="check"></i> Plan Gratuit activ`;
  }
  if (goPro) {
    if (state.isPro) {
      goPro.disabled = true;
      goPro.innerHTML = `<i data-lucide="crown"></i> Pro activ`;
    } else {
      goPro.disabled = false;
      goPro.innerHTML = `<i data-lucide="crown"></i> Activează Pro`;
    }
  }
  if (window.lucide) lucide.createIcons();
}

/* -------- Sanitizare & markdown ușor -------- */
const sanitize = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function renderMarkdownLite(md) {
  md = sanitize(md);
  md = md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const lines = md
    .split(/\n/)
    .map((l) => {
      if (/^\s*-\s+/.test(l)) return `<li>${l.replace(/^\s*-\s+/, "")}</li>`;
      if (/^\s*\d+\.\s+/.test(l)) return `<p>${l}</p>`;
      return `<p>${l}</p>`;
    })
    .join("");
  return lines.replace(
    /(<li>[\s\S]*?<\/li>)/g,
    '<ul class="list-disc pl-5">$1</ul>'
  );
}

/* -------- Normalizare meta rețetă -------- */
const boldifyLabels = (t) => {
  [
    "Denumire",
    "Porții",
    "Timp",
    "Ingrediente",
    "Pași",
    "Sfaturi/variante",
    "Sfaturi",
    "Variante"
  ].forEach((L) => {
    const re = new RegExp(`(^|\\n)\\s*${L}\\s*:`, "gi");
    t = t.replace(re, (m, pre) => `${pre}**${L}:**`);
  });
  return t
    .replace(/\*\*Sfaturi:\*\*/gi, "**Sfaturi/variante:**")
    .replace(/\*\*Variante:\*\*/gi, "**Sfaturi/variante:**");
};

const stripThought = (text) => {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) =>
    /\*\*\s*(Denumire|Ingrediente|Pași|Porții|Timp)\s*:\s*\*\*/i.test(l) ||
    /^\s*(Denumire|Ingrediente|Pași|Porții|Timp)\s*:/i.test(l)
  );
  if (startIdx > 0) return lines.slice(startIdx).join("\n");
  const idxList = lines.findIndex((l) => /^\s*[-\d]/.test(l));
  return idxList > 0 ? lines.slice(idxList - 1).join("\n") : text;
};

const extract = (label, text) => {
  const m = text.match(
    new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i")
  );
  return m ? m[1].trim() : "";
};

const ensureServingsLabel = (s) => {
  if (!s) return "";
  let out = s
    .replace(/\bbuc\.?\b/gi, "porții")
    .replace(/\bbucati?\b/gi, "porții");
  if (!/porț|portii|pers/i.test(out)) out = `${out} porții`;
  return out.replace(/portii/gi, "porții");
};

function normalizeMeta(content, fallbackTitle = "Rețetă") {
  let c = boldifyLabels(stripThought(content));
  let title = extract("Denumire", c);
  let servings = ensureServingsLabel(extract("Porții", c));
  let time = extract("Timp", c);

  const prefix = [];
  if (!title) {
    title = fallbackTitle;
    prefix.push(`**Denumire:** ${title}`);
  }
  if (!servings) {
    servings = "4 porții";
    prefix.push(`**Porții:** ${servings}`);
  }
  if (!time) {
    time = "—";
    prefix.push(`**Timp:** ${time}`);
  }
  if (prefix.length) c = prefix.join("\n") + "\n" + c;

  // curăță dubluri
  c = c
    .replace(
      /(\*\*Denumire:\*\*[\s\S]*?\n)(?=[\s\S]*\*\*Denumire:\*\*)/i,
      ""
    )
    .replace(
      /(\*\*Porții:\*\*[\s\S]*?\n)(?=[\s\S]*\*\*Porții:\*\*)/i,
      ""
    )
    .replace(
      /(\*\*Timp:\*\*[\s\S]*?\n)(?=[\s\S]*\*\*Timp:\*\*)/i,
      ""
    );

  return { content: c, title, servings, time };
}

const metaLineFrom = (time, servings) => {
  let t = time || "";
  const mTotal = t.match(/total\s*([^(\n]+)/i);
  let out = mTotal ? mTotal[1].trim() : t.trim();
  if (!out) {
    const m = t.match(
      /(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*(?:min|minute|m))/i
    );
    if (m) out = m[1].replace(/\s*h/, " h").replace(/\s*m/, " m");
  }
  out = out || "—";
  const left = `<span class="chip">${SVG_TIMER} ${out}</span>`;
  const rightVal = servings ? ensureServingsLabel(servings) : "";
  const right = rightVal
    ? `<span class="chip">${SVG_USERS} ${rightVal}</span>`
    : "";
  return right
    ? `${left} <span class="text-slate-600">•</span> ${right}`
    : left;
};

/* -------- Typewriter HTML -------- */
async function typewriterHTML(el, html, cps = 52) {
  el.innerHTML = "";
  let i = 0,
    out = "";
  const baseInterval = 1000 / cps;
  const extraDelay = (ch) =>
    ch === "\n" ? 120 : /[.,!?;:]/.test(ch) ? 80 : 0;
  let last = performance.now();
  return new Promise((resolve) => {
    function step(now) {
      while (now - last >= baseInterval && i < html.length) {
        if (html[i] === "<") {
          const j = html.indexOf(">", i);
          if (j === -1) {
            out += html.slice(i);
            i = html.length;
            break;
          }
          out += html.slice(i, j + 1);
          i = j + 1;
          continue;
        }
        const ch = html[i++];
        out += ch;
        last += baseInterval + extraDelay(ch);
      }
      el.innerHTML = out;
      if (i < html.length) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

/* -------- Rețete standard (10) -------- */
const STANDARD_RECIPES = [
  {
    title: "Supă de pui clasică",
    time: "1 h 45",
    servings: "4–6 porții",
    img: "https://agricola.ro/var/uploads/seo/supa-de-pui.jpg",
    body: `**Ingrediente:**
- Pui 1 kg
- Morcov 200 g, țelină 100 g, păstârnac 100 g
- Ceapă 1 (150 g), usturoi 2 căței
- Foi de dafin 2, piper boabe
- Sare, pătrunjel verde
- Apă 2,5 l

**Pași:**
1. Fierbe puiul în apă rece; spumează 10 min.
2. Adaugă legumele + dafin; fierbe încet ~1 h 15.
3. Scoate carnea, dezosează; întoarce-o în supă.
4. Potrivește de sare/piper, presară pătrunjel.

**Sfaturi/variante:** Tăiței sau orez în ultimele 12–15 min.`
  },

  {
    title: "Penne al Pomodoro",
    time: "20 min",
    servings: "2–3 porții",
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTdOc93-asK4zjYZa4b8QkMufKtW52MC972zg&s",
    body: `**Ingrediente:**
- Penne 200 g, roșii zdrobite 300 g
- Usturoi 2 căței, ulei 2 linguri
- Busuioc, sare, piper

**Pași:**
1. Fierbe pastele al dente.
2. Călește usturoiul; adaugă roșiile 10 min.
3. Amestecă cu pastele; adaugă busuioc.`
  },

  {
    title: "Supă cremă de dovleac",
    time: "35 min",
    servings: "3–4 porții",
    img: "https://www.blondelish.com/wp-content/uploads/2018/10/Easy-Creamy-Pumpkin-Soup-Recipe-14.jpg",
    body: `**Ingrediente:**
- Dovleac 700 g, ceapă 1
- Ghimbir 10 g, supă 600 ml
- Smântână 80 ml, sare, piper, ulei

**Pași:**
1. Coace dovleacul cu ulei.
2. Călește ceapa+ghimbir, adaugă dovleacul și supa.
3. Fierbe 10 min, pasează; adaugă smântâna.`
  },

  {
    title: "Salată grecească",
    time: "10 min",
    servings: "2–3 porții",
    img: "https://www.lalena.ro/images/uploaded/1920x_Salata-Greceasca-Reteta-VIDEO-121.jpg",
    body: `**Ingrediente:**
- Roșii 300 g, castraveți 250 g
- Ceapă roșie 60 g, măsline 60 g
- Feta 120 g, ulei 2 linguri, oțet 1 lingură
- Oregano, sare

**Pași:**
1. Taie legumele, adaugă măsline și feta.
2. Dressează cu ulei+oțet+oregano.`
  },

  {
    title: "Pui la cuptor cu cartofi",
    time: "1 h 15",
    servings: "4 porții",
    img: "https://api.retete.transavia.ro/file/retete/295__RetetaDePuiLaCuptorCuCartofiSiUsturoiCumOPrepari01.jpg",
    body: `**Ingrediente:**
- Pulpe pui 1 kg, cartofi 800 g
- Usturoi 4 căței, ulei 2 linguri
- Boia, rozmarin, sare, piper

**Pași:**
1. Asezonează puiul și cartofii; stropește cu ulei.
2. Coace la 200°C ~60–70 min, întorcând o dată.`
  },

  {
    title: "Shakshuka",
    time: "30 min",
    servings: "2–3 porții",
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcReYJasi1V24CPah3hMR9m2XehljsU8k0N5oA&s",
    body: `**Ingrediente:**
- Ouă 4, roșii 400 g, ardei 1, ceapă 1
- Usturoi 2 căței, chimion, boia, sare, piper

**Pași:**
1. Călește ceapa+ardeiul+usturoiul.
2. Adaugă roșiile și condimentele; fierbe 10 min.
3. Sparge ouăle; gătește 6–8 min acoperit.`
  },

  {
    title: "Clătite subțiri",
    time: "30 min",
    servings: "10–12 porții",
    img: "https://www.lalena.ro/images/uploaded/1920x_Aluat-pentru-clatite-Reteta-VIDEO-972.jpg",
    body: `**Ingrediente:**
- Ouă 2, lapte 350 ml, făină 180 g
- Ulei 1 lingură, sare un praf

**Pași:**
1. Amestecă până la aluat fluid.
2. Coace foi subțiri în tigaie antiaderentă.`
  },

  {
    title: "Tocăniță de vită",
    time: "2 h",
    servings: "4 porții",
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYfRBYwjhCUuUIy7ObBpBG6Xcd6NhLX1DrkQ&s",
    body: `**Ingrediente:**
- Carne vită 800 g, ceapă 2
- Morcov 2, usturoi 3 căței, pastă roșii 1 lingură
- Supă 700 ml, foi de dafin, cimbru

**Pași:**
1. Rumenește carnea; scoate-o.
2. Călește ceapa+morcovul+usturoiul; adaugă pasta.
3. Pune carnea, supa și condimentele; fierbe încet ~1 h 30–2 h.`
  },

  {
    title: "Risotto cu ciuperci",
    time: "35–40 min",
    servings: "3 porții",
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTnBW7yEZiIDIJL2pru8eAFYZq-odLoh6ljAQ&s",
    body: `**Ingrediente:**
- Orez Arborio 240 g, ciuperci 300 g
- Ceapă 1 mică, unt 40 g, ulei 1 lingură
- Vin alb 80 ml, supă 800 ml, parmezan 40 g

**Pași:**
1. Călește ceapa, apoi orezul 1–2 min.
2. Stinge cu vin; adaugă câte un polonic de supă, amestecând.
3. Separat sotează ciupercile; încorporează la final cu unt și parmezan.`
  },

  {
    title: "Chifteluțe la cuptor",
    time: "45 min",
    servings: "4 porții",
    img: "https://dulciurele.com/wp-content/uploads/2021/06/adeefc16-4b1b-4c25-b162-68863dc01897.jpeg?w=765&h=380&crop=1",
    body: `**Ingrediente:**
- Carne tocată 700 g, ouă 2, pesmet 80 g
- Ceapă 1, usturoi 2 căței, pătrunjel
- Sare, piper, boia

**Pași:**
1. Amestecă toate ingredientele; formează bile.
2. Coace la 200°C ~22–25 min, întorcând 1 dată.`
  }
];

/* -------- Populate standard grid -------- */
(function renderStandard() {
  const grid = $("standardGrid");
  if (!grid) return;
  grid.innerHTML = "";
  STANDARD_RECIPES.forEach((r) => {
    const el = document.createElement("article");
    el.className = "card p-0 overflow-hidden hover-card";
    const servingsTxt = ensureServingsLabel(r.servings);
    el.innerHTML = `
      <div class="relative">
        <img class="w-full h-44 object-cover" alt="${r.title}" src="${r.img}"/>
      </div>
      <div class="p-4">
        <h4 class="font-semibold text-lg">${r.title}</h4>
        <div class="mt-2 flex flex-wrap gap-2">
          <span class="chip">${SVG_TIMER} ${r.time}</span>
          <span class="chip">${SVG_USERS} ${servingsTxt}</span>
        </div>
        <button class="btn-primary mt-3">
          <i data-lucide="list-checks" class="w-4 h-4"></i>
          Detalii
        </button>
      </div>`;
    el.querySelector("button.btn-primary").addEventListener("click", () => {
      $("stdTitle").textContent = r.title;
      $("stdBody").innerHTML = renderMarkdownLite(r.body);
      $("stdModal").showModal();
      if (window.lucide) lucide.createIcons();
    });
    grid.appendChild(el);
  });
  if (window.lucide) lucide.createIcons();
})();

/* -------- Modale: close pe click în afara cardului -------- */
["stdModal", "payModal"].forEach((id) => {
  const dlg = $(id);
  if (!dlg) return;
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
});

/* -------- AI (deduce credite; Pro=nelimitat) -------- */
const goBtn = $("go"),
  clrBtn = $("clear"),
  promptEl = $("prompt");
const loader = $("aiLoader"),
  aiErr = $("aiError");
const aiCard = $("aiCard"),
  aiTitle = $("aiTitle"),
  aiMeta = $("aiMeta"),
  aiBody = $("aiBody");

/* -------- Rețete salvate UI -------- */
function openSavedRecipe(index) {
  const r = state.savedRecipes[index];
  if (!r) return;

  // actualizează ultima rețetă
  state.lastRecipe = { ...r };

  aiErr.classList.add("hidden");
  aiErr.textContent = "";

  aiTitle.textContent = r.title || "Rețetă";
  aiMeta.innerHTML = metaLineFrom(r.time, ensureServingsLabel(r.servings));
  aiBody.innerHTML = renderMarkdownLite(r.body);
  aiCard.classList.remove("hidden");

  // scroll către secțiunea AI pentru claritate
  const aiSection = $("ai");
  if (aiSection) {
    aiSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (window.lucide) lucide.createIcons();
}

function renderSavedRecipes() {
  const grid = $("savedGrid");
  const noSaved = $("noSaved");
  const clearSaved = $("clearSaved");
  if (!grid) return;

  grid.innerHTML = "";
  if (!state.savedRecipes.length) {
    noSaved?.classList.remove("hidden");
    clearSaved?.classList.add("hidden");
    if (window.lucide) lucide.createIcons();
    return;
  }

  noSaved?.classList.add("hidden");
  clearSaved?.classList.remove("hidden");

  state.savedRecipes.forEach((r, idx) => {
    const card = document.createElement("article");
    card.className = "card p-3 saved-card";
    const metaLine = metaLineFrom(r.time, r.servings);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <h5 class="saved-title">${r.title || "Rețetă"}</h5>
          <div class="saved-meta mt-1">${metaLine}</div>
        </div>
        <button class="icon-btn icon-btn-sm saved-open-btn" data-idx="${idx}" title="Deschide rețeta">
          <i data-lucide="external-link" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  // evenimente click pentru fiecare card salvat
  grid.querySelectorAll(".saved-open-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      openSavedRecipe(idx);
    });
  });

  if (window.lucide) lucide.createIcons();
}

/* Clear saved */
$("clearSaved")?.addEventListener("click", () => {
  state.savedRecipes = [];
  renderSavedRecipes();
  showToast("Rețetele salvate au fost șterse.", "success");
});

/* Clear AI */
if (clrBtn) {
  clrBtn.addEventListener("click", () => {
    promptEl.value = "";
    aiErr.classList.add("hidden");
    aiErr.textContent = "";
    aiCard.classList.add("hidden");
    aiTitle.textContent = "";
    aiMeta.innerHTML = "";
    aiBody.innerHTML = "";
    state.lastRecipe = { title: "", body: "", servings: "", time: "" };
  });
}

/* Copiere / salvare rețetă AI */
const copyBtn = $("copyRecipe");
const saveBtn = $("saveRecipe");

copyBtn?.addEventListener("click", async () => {
  if (!state.lastRecipe || !state.lastRecipe.body) {
    showToast("Generează mai întâi o rețetă AI.", "error");
    return;
  }
  const fullText = `${state.lastRecipe.title || "Rețetă"}\nPorții: ${
    state.lastRecipe.servings || "-"
  }\nTimp: ${state.lastRecipe.time || "-"}\n\n${state.lastRecipe.body}`;
  try {
    await navigator.clipboard.writeText(fullText);
    showToast("Rețeta a fost copiată în clipboard.", "success");
  } catch {
    showToast("Nu am putut copia rețeta.", "error");
  }
});

saveBtn?.addEventListener("click", () => {
  if (!state.lastRecipe || !state.lastRecipe.body) {
    showToast("Generează mai întâi o rețetă AI.", "error");
    return;
  }
  const existing = state.savedRecipes.find(
    (r) => r.title === state.lastRecipe.title && r.body === state.lastRecipe.body
  );
  if (existing) {
    showToast("Rețeta este deja salvată.", "info");
    return;
  }
  state.savedRecipes.unshift({ ...state.lastRecipe });
  if (state.savedRecipes.length > 10) state.savedRecipes.pop();
  renderSavedRecipes();
  showToast("Rețetă salvată.", "success");
});

/* -------- Cerebras AI call -------- */
async function generateRecipe(userPrompt) {
  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      max_completion_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM_RULES },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Eroare API (${res.status}): ${err}`);
  }
  const data = await res.json();
  let content = (data.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error("Răspuns gol de la model.");
  if (content.includes("__UNSUPPORTED__")) {
    throw new Error("Solicitarea nu este culinară. Reformulează te rog.");
  }
  return content;
}

if (goBtn) {
  goBtn.addEventListener("click", async () => {
    const userPrompt = (promptEl.value || "").trim();
    aiErr.classList.add("hidden");
    aiErr.textContent = "";
    aiCard.classList.add("hidden");
    aiTitle.textContent = "";
    aiMeta.innerHTML = "";
    aiBody.innerHTML = "";

    if (!userPrompt) {
      aiErr.textContent = "Te rugăm să adaugi o descriere culinară.";
      aiErr.classList.remove("hidden");
      return;
    }

    if (!state.isPro && state.credits <= 0) {
      aiErr.innerHTML =
        'Nu mai ai credite. Mergi la <a href="#pricing" class="underline">Pricing</a> sau apasă pe "Cont" pentru a reîncărca.';
      aiErr.classList.remove("hidden");
      showToast("Nu mai ai credite. Reîncarcă din secțiunea Pricing.", "info");
      return;
    }

    loader.classList.remove("hidden");

    try {
      const raw = await generateRecipe(userPrompt);
      const { content: normalized, title, servings, time } = normalizeMeta(
        raw,
        "Rețetă"
      );
      const bodyOnly = normalized
        .replace(/\*\*Denumire:\*\*[\s\S]*?\n/i, "")
        .replace(/\*\*Porții:\*\*[\s\S]*?\n/i, "")
        .replace(/\*\*Timp:\*\*[\s\S]*?\n/i, "");

      if (!state.isPro) {
        state.credits = Math.max(0, state.credits - 1);
      }
      refreshAccountUI();

      aiTitle.textContent = title || "Rețetă";
      aiMeta.innerHTML = metaLineFrom(time, ensureServingsLabel(servings));

      const html = renderMarkdownLite(bodyOnly);
      aiCard.classList.remove("hidden");
      await typewriterHTML(aiBody, html, 52);
      if (window.lucide) lucide.createIcons();

      state.lastRecipe = { title, body: bodyOnly, servings, time };
    } catch (e) {
      aiErr.textContent = e.message || "Eroare necunoscută.";
      aiErr.classList.remove("hidden");
    } finally {
      loader.classList.add("hidden");
    }
  });
}

/* -------- Checkout demo (card) -------- */
const payModal = $("payModal");
const payForm = $("payForm");
const payError = $("payError");
const paySubmit = $("paySubmit");
const payPlanName = $("payPlanName");
const payPlanPrice = $("payPlanPrice");
const cardPreviewNumber = $("cardPreviewNumber");
const cardPreviewName = $("cardPreviewName");
const cardPreviewExpiry = $("cardPreviewExpiry");
const cardPreviewPlan = $("cardPreviewPlan");
const cardNameInput = $("cardName");
const cardNumberInput = $("cardNumber");
const cardExpiryInput = $("cardExpiry");
const cardCvvInput = $("cardCvv");

function updatePayPlanVisuals() {
  const plan = PLANS[currentPlan];
  if (!plan) return;
  if (payPlanName) payPlanName.textContent = plan.name;
  if (payPlanPrice) payPlanPrice.textContent = plan.priceLabel;
  if (cardPreviewPlan) cardPreviewPlan.textContent = plan.name;
}

function openPay(planId = "pack10") {
  currentPlan = planId in PLANS ? planId : "pack10";
  const radioPack10 = $("planPack10");
  const radioPro = $("planPro");
  if (radioPack10 && radioPro) {
    radioPack10.checked = currentPlan === "pack10";
    radioPro.checked = currentPlan === "pro";
  }
  updatePayPlanVisuals();
  payError?.classList.add("hidden");
  if (payForm) payForm.reset();
  // reset preview
  if (cardPreviewNumber) cardPreviewNumber.textContent = "•••• •••• •••• ••••";
  if (cardPreviewName) cardPreviewName.textContent = "Numele tău";
  if (cardPreviewExpiry) cardPreviewExpiry.textContent = "MM/YY";

  payModal?.showModal();
  if (window.lucide) lucide.createIcons();
}

/* Deschidere din header "cont" */
$("accountBadge")?.addEventListener("click", () => openPay("pack10"));

/* Deschidere din pricing */
$("goPro")?.addEventListener("click", () => openPay("pro"));
document.querySelectorAll(".buy-pack")?.forEach((btn) => {
  btn.addEventListener("click", () => openPay("pack10"));
});

/* Plan radio change */
document
  .querySelectorAll('input[name="plan"]')
  .forEach((radio) =>
    radio.addEventListener("change", (e) => {
      currentPlan = e.target.value;
      updatePayPlanVisuals();
    })
  );

/* Update card preview în timp real */
if (cardNameInput) {
  cardNameInput.addEventListener("input", () => {
    const val = cardNameInput.value.trim();
    cardPreviewName.textContent = val || "Numele tău";
  });
}

if (cardNumberInput) {
  cardNumberInput.addEventListener("input", () => {
    const digits = cardNumberInput.value.replace(/\D/g, "").slice(0, 16);
    const groups = digits.match(/.{1,4}/g) || [];
    const formatted = groups.join(" ");
    cardNumberInput.value = formatted;
    cardPreviewNumber.textContent = formatted || "•••• •••• •••• ••••";
  });
}

if (cardExpiryInput) {
  cardExpiryInput.addEventListener("input", () => {
    let val = cardExpiryInput.value.replace(/\D/g, "").slice(0, 4);
    if (val.length >= 3) val = val.slice(0, 2) + "/" + val.slice(2);
    cardExpiryInput.value = val;
    cardPreviewExpiry.textContent = val || "MM/YY";
  });
}

/* Validare simplă card */
function validateCardForm() {
  const name = (cardNameInput?.value || "").trim();
  const num = (cardNumberInput?.value || "").replace(/\s+/g, "");
  const exp = (cardExpiryInput?.value || "").trim();
  const cvv = (cardCvvInput?.value || "").trim();

  if (!name || name.length < 3) {
    return "Te rugăm să completezi numele de pe card.";
  }
  if (!/^\d{16}$/.test(num)) {
    return "Numărul de card trebuie să conțină 16 cifre.";
  }
  if (!/^\d{2}\/\d{2}$/.test(exp)) {
    return "Data de expirare trebuie să fie în format MM/YY.";
  }
  const [mmStr] = exp.split("/");
  const mm = Number(mmStr);
  if (mm < 1 || mm > 12) {
    return "Luna de expirare nu este validă.";
  }
  if (!/^\d{3,4}$/.test(cvv)) {
    return "CVV trebuie să conțină 3–4 cifre.";
  }
  return "";
}

/* Submit plată demo */
payForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!paySubmit) return;

  const errMsg = validateCardForm();
  if (errMsg) {
    payError.textContent = errMsg;
    payError.classList.remove("hidden");
    return;
  }

  payError.classList.add("hidden");
  const originalLabel = paySubmit.innerHTML;
  paySubmit.disabled = true;
  paySubmit.innerHTML =
    '<span class="loader-dot"></span> Se procesează plata...';

  try {
    // Simulare întârziere
    await new Promise((res) => setTimeout(res, 1000));

    const plan = PLANS[currentPlan];
    if (!plan) throw new Error("Plan necunoscut.");

    if (plan.makesPro) {
      state.isPro = true;
    } else {
      state.credits += plan.credits;
    }
    refreshAccountUI();

    const msg = plan.makesPro
      ? "Pro a fost activat (demo)."
      : `+${plan.credits} credite au fost adăugate (demo).`;
    showToast(msg, "success");
    payModal?.close();
  } catch (err) {
    payError.textContent = err.message || "Eroare la simularea plății.";
    payError.classList.remove("hidden");
  } finally {
    paySubmit.disabled = false;
    paySubmit.innerHTML = originalLabel;
  }
});

/* -------- Inițializare -------- */
(function init() {
  refreshAccountUI();
  renderSavedRecipes();
  if (window.lucide) lucide.createIcons();
})();
