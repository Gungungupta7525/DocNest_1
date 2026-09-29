/**
 * app.js
 * Homepage controller: loads tutorials from Supabase, renders the scalable
 * card-grid landing (with topic + level filters), and wires the navbar
 * search so typing filters cards live (search also matches tags).
 */

import {
  fetchText,
  calculateReadingTime,
  getQueryParam,
  escapeHtml,
} from "./utils.js";
import { createSearch } from "./search.js";
import { initReveal } from "./reveal.js";

const state = {
  tutorials: [], // full index, enriched with readingTime
  query: "",
  category: "all",
  difficulty: "all",
};

const grid = document.getElementById("tutorial-grid");
const resultsEl = document.getElementById("grid-results");

const search = createSearch({
  onQueryChange: (query) => {
    state.query = query.trim().toLowerCase();
    applyFilters();
  },
});

init();

async function init() {
  renderSkeletons(8);
  bindNavLinks();

  try {
    // Load tutorial metadata from Supabase
    const { data: index, error } = await window.supabaseClient
      .from("tutorials")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    if (!index || index.length === 0) {
      throw new Error("No tutorials found in Supabase.");
    }

    state.tutorials = await enrichWithReadingTime(index);
    search.setIndex(state.tutorials);
    renderFilters(state.tutorials);
    renderGrid(state.tutorials);
    initReveal();
    scrollToCategory(getQueryParam("category"));
  } catch (err) {
    renderError(err);
  }
}

/**
 * Reading time is estimated from each tutorial's actual word count,
 * so the homepage and the tutorial page always agree.
 */
async function enrichWithReadingTime(index) {
  return Promise.all(
    index.map(async (tutorial) => {
      try {
        const text = await fetchText(tutorial.file);
        return { ...tutorial, readingTime: calculateReadingTime(text) };
      } catch {
        return { ...tutorial, readingTime: null };
      }
    })
  );
}

function renderSkeletons(count) {
  grid.innerHTML = Array.from({ length: count })
    .map(() => `<div class="skeleton-card" aria-hidden="true"></div>`)
    .join("");
}

/* --------------------------------------------------------------------- */
/* Navbar                                                                 */
/* --------------------------------------------------------------------- */

/** "Learning Paths" clears any active filter so the grid shows everything. */
function bindNavLinks() {
  document.querySelectorAll('a[href="#learning-paths"]').forEach((link) => {
    link.addEventListener("click", () => clearFilters());
  });
}

/* --------------------------------------------------------------------- */
/* Filter chips                                                           */
/* --------------------------------------------------------------------- */

function renderFilters(index) {
  const container = document.getElementById("path-filters");
  if (!container) return;

  const categories = [...new Set(index.map((t) => t.category))].sort();
  const difficulties = [...new Set(index.map((t) => t.difficulty))].sort();

  let chips = chipGroup(
    "Filter by topic",
    [{ value: "all", label: "All topics" }].concat(
      categories.map((name) => ({ value: name, label: name }))
    ),
    "category",
    state.category
  );

  chips += chipGroup(
    "Filter by level",
    [{ value: "all", label: "All levels" }].concat(
      difficulties.map((name) => ({ value: name, label: name }))
    ),
    "difficulty",
    state.difficulty
  );

  container.innerHTML = chips;
  container.hidden = false;

  container.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.category) {
        state.category = chip.dataset.category;
      } else {
        state.difficulty = chip.dataset.difficulty;
      }
      updateChipStates();
      applyFilters();
    });
  });
}

function chipGroup(label, items, key, activeValue) {
  const buttons = items
    .map((item) => {
      const isActive = item.value === activeValue;
      return `
        <button
          type="button"
          class="filter-chip${isActive ? " active" : ""}"
          data-${key}="${escapeHtml(item.value)}"
        >${escapeHtml(item.label)}</button>
      `;
    })
    .join("");

  return `
    <div class="chip-group" role="group" aria-label="${label}">
      ${buttons}
    </div>
  `;
}

function updateChipStates() {
  document.querySelectorAll("#path-filters .filter-chip").forEach((chip) => {
    if (chip.dataset.category) {
      chip.classList.toggle("active", chip.dataset.category === state.category);
    } else {
      chip.classList.toggle(
        "active",
        chip.dataset.difficulty === state.difficulty
      );
    }
  });
}

function clearFilters() {
  state.query = "";
  state.category = "all";
  state.difficulty = "all";

  if (search.input) search.input.value = "";

  updateChipStates();
  applyFilters();
}

/** Scroll offset for cross-page deep links (?category=). */
function scrollToCategory(category) {
  if (!category) return;

  const target = document.getElementById("tutorial-grid");
  const anchor = document.querySelector(
    `#path-filters [data-category="${CSS.escape(category)}"]`
  );

  if (anchor) {
    anchor.classList.add("active");
    state.category = category;
    updateChipStates();
    applyFilters();
  }

  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

/* --------------------------------------------------------------------- */
/* Card grid                                                              */
/* --------------------------------------------------------------------- */

function renderGrid(tutorials) {
  grid.innerHTML = tutorials.map(renderCard).join("");
}

function renderCard(tutorial, index) {
  const meta = [
    tutorial.category,
    tutorial.difficulty,
    tutorial.readingTime ? `${tutorial.readingTime} min` : null,
  ].filter(Boolean);

  const delay = Math.min(index * 60, 480);

  return `
    <article
      class="tutorial-card"
      data-reveal
      style="--reveal-delay: ${delay}ms"
      data-category="${escapeHtml(tutorial.category)}"
      data-difficulty="${escapeHtml(tutorial.difficulty)}"
      data-searchable="${escapeHtml(
        `${tutorial.title} ${tutorial.description} ${tutorial.category} ${tutorial.difficulty} ${(tutorial.tags || []).join(" ")}`
      ).toLowerCase()}"
    >
      <a href="tutorial.html?id=${encodeURIComponent(tutorial.id)}">
        <h3 class="card-title">${escapeHtml(tutorial.title)}</h3>
        <p class="card-desc">${escapeHtml(tutorial.description)}</p>
        <div class="card-meta">
          ${meta
            .map(
              (m, i) =>
                `${i ? `<span class="meta-dot" aria-hidden="true">·</span>` : ""}<span>${escapeHtml(m)}</span>`
            )
            .join("")}
        </div>
      </a>
    </article>
  `;
}

/* --------------------------------------------------------------------- */
/* Live filtering across cards                                            */
/* --------------------------------------------------------------------- */

function applyFilters() {
  const query = state.query;
  const category = state.category;
  const difficulty = state.difficulty;

  const hasFilters =
    query !== "" || category !== "all" || difficulty !== "all";

  let matchCount = 0;

  grid.querySelectorAll(".tutorial-card").forEach((card) => {
    const matchesQuery =
      !query || card.dataset.searchable.includes(query);

    const matchesCategory =
      category === "all" || card.dataset.category === category;

    const matchesDifficulty =
      difficulty === "all" || card.dataset.difficulty === difficulty;

    const matches =
      matchesQuery && matchesCategory && matchesDifficulty;

    card.hidden = !matches;

    if (matches) matchCount++;
  });

  resultsEl.textContent =
    hasFilters || matchCount !== state.tutorials.length
      ? `${matchCount} tutorial${matchCount === 1 ? "" : "s"}`
      : "";

  if (matchCount === 0 && state.tutorials.length > 0) {
    ensureEmptyState();
  } else {
    document.getElementById("empty-state")?.remove();
  }
}

function ensureEmptyState() {
  document.getElementById("empty-state")?.remove();

  grid.insertAdjacentHTML(
    "beforeend",
    `<div class="empty-state" id="empty-state">
      <h3>No tutorials match your filters</h3>
      <p>Try a different topic, level, or keyword.</p>
      <button type="button" class="empty-reset" id="empty-reset">Clear filters</button>
    </div>`
  );

  document
    .getElementById("empty-reset")
    ?.addEventListener("click", clearFilters);
}

/* --------------------------------------------------------------------- */
/* Misc                                                                   */
/* --------------------------------------------------------------------- */

function renderError(err) {
  grid.innerHTML = `<div class="empty-state">
    <h3>Couldn't load tutorials</h3>
    <p>${escapeHtml(err.message)}</p>
  </div>`;

  console.error(err);
}