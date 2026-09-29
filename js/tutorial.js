/**
 * tutorial.js
 * Tutorial page controller: resolves the ?id= from the URL, loads the
 * matching Markdown file, renders the article, builds the sidebar + table
 * of contents, and wires up reading progress, related tutorials, feedback,
 * previous/next navigation, and language-tabbed code blocks.
 */

import {
  fetchText,
  getQueryParam,
  calculateReadingTime,
  formatDate,
  escapeHtml,
} from "./utils.js";

import {
  renderMarkdown,
  initCopyButtons,
  initCodeTabs,
  initMermaid,
} from "./markdown.js";

import {
  buildSidebar,
  initSidebarDrawer,
} from "./sidebar.js";

import { createSearch } from "./search.js";

const contentEl = document.getElementById("markdown-content");
const titleEl = document.getElementById("tutorial-title");
const breadcrumbEl = document.getElementById("tutorial-breadcrumb");
const metaRowEl = document.getElementById("tutorial-meta-row");
const tocEl = document.getElementById("toc");
const paginationEl = document.getElementById("tutorial-pagination");
const relatedSection = document.getElementById("related-section");
const feedbackWidget = document.getElementById("feedback-widget");
const sidebarEl = document.getElementById("sidebar");
const progressBar = document.getElementById("reading-progress");

const search = createSearch();

init();

async function init() {
  const id = getQueryParam("id");

  initSidebarDrawer();
  initReadingProgress();

  if (!id) {
    renderMissing("No tutorial was specified.");
    return;
  }

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

    const currentIndex = index.findIndex((t) => t.id === id);
    const tutorial = index[currentIndex];

    if (!tutorial) {
      renderMissing(`No tutorial found with id "${id}".`);
      return;
    }

    document.title = `${tutorial.title} · DocNest`;

    search.setIndex(index);
    buildSidebar(sidebarEl, index, tutorial.id);

    // Markdown files are still loaded from the existing tutorials/ folder
    const markdownText = await fetchText(tutorial.file);

    renderHeader(tutorial, markdownText);
    renderArticle(markdownText);
    buildTableOfContents();
    initMermaid(contentEl);
    initCodeTabs(contentEl);
    initCopyButtons(contentEl);
    renderRelated(index, tutorial);
    initFeedback(tutorial.id);
    renderPagination(index, currentIndex);
    observeActiveSection();
  } catch (err) {
    renderMissing(err.message);
    console.error(err);
  }
}

function renderHeader(tutorial, markdownText) {
  const wordCount = markdownText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const readingTime = calculateReadingTime(markdownText);

  breadcrumbEl.innerHTML = `
    <a href="index.html">Home</a>
    / <a href="index.html?category=${encodeURIComponent(tutorial.category)}">${escapeHtml(tutorial.category)}</a>
    / <span class="accent">${escapeHtml(tutorial.title)}</span>
  `;

  titleEl.textContent = tutorial.title;

  metaRowEl.innerHTML = `
    <span class="meta-chip">${clockIconSvg()} ${readingTime} min read</span>
    <span class="meta-chip">${escapeHtml(tutorial.difficulty)}</span>
    <span class="meta-chip">${wordCount.toLocaleString()} words</span>
    ${
      tutorial.subtopic
        ? `<span class="meta-chip subtopic-chip">${escapeHtml(tutorial.subtopic)}</span>`
        : ""
    }
    ${
      tutorial.updated
        ? `<span class="meta-chip">Updated ${formatDate(tutorial.updated)}</span>`
        : ""
    }
  `;

  feedbackWidget.hidden = false;
}

function renderArticle(markdownText) {
  contentEl.innerHTML = renderMarkdown(markdownText);
}

/* --------------------------------------------------------------------- */
/* Reading progress bar                                                   */
/* --------------------------------------------------------------------- */

function initReadingProgress() {
  const update = () => {
    const scrollable = document.documentElement;
    const max = scrollable.scrollHeight - window.innerHeight;
    const ratio =
      max > 0 ? Math.min(1, window.scrollY / max) : 0;

    progressBar.style.width = `${ratio * 100}%`;
  };

  let ticking = false;

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;

      ticking = true;

      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true }
  );

  window.addEventListener("resize", update, { passive: true });

  update();
}

/* --------------------------------------------------------------------- */
/* Related tutorials + feedback                                           */
/* --------------------------------------------------------------------- */

function renderRelated(index, current) {
  const related = index
    .filter(
      (t) =>
        t.category === current.category &&
        t.id !== current.id
    )
    .slice(0, 3);

  if (related.length === 0) {
    relatedSection.hidden = true;
    return;
  }

  relatedSection.hidden = false;

  relatedSection.innerHTML = `
    <h2 class="related-title">More in ${escapeHtml(current.category)}</h2>
    <div class="related-grid">
      ${related
        .map(
          (tutorial) => `
            <a
              class="related-card"
              href="tutorial.html?id=${encodeURIComponent(tutorial.id)}"
            >
              <span class="related-card-title">
                ${escapeHtml(tutorial.title)}
              </span>

              <span class="related-card-desc">
                ${escapeHtml(tutorial.description)}
              </span>

              <span class="related-card-meta">
                <span>${escapeHtml(tutorial.difficulty)}</span>

                ${
                  tutorial.updated
                    ? `<span>Updated ${formatDate(tutorial.updated)}</span>`
                    : ""
                }
              </span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function initFeedback(tutorialId) {
  const storageKey = `docnest.feedback.${tutorialId}`;
  const buttons = feedbackWidget.querySelectorAll(".feedback-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      feedbackWidget.classList.add("voted");

      try {
        localStorage.setItem(
          storageKey,
          button.dataset.vote
        );
      } catch {
        /* storage unavailable — vote just won't persist */
      }
    });
  });

  try {
    if (localStorage.getItem(storageKey)) {
      feedbackWidget.classList.add("voted");
    }
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------- */
/* Table of contents + active section                                     */
/* --------------------------------------------------------------------- */

function buildTableOfContents() {
  const headings = contentEl.querySelectorAll("h2, h3");

  if (headings.length === 0) {
    tocEl.innerHTML = "";
    return;
  }

  const items = Array.from(headings)
    .map((heading) => {
      const level =
        heading.tagName === "H3"
          ? "level-3"
          : "level-2";

      return `
        <li class="${level}">
          <a
            href="#${heading.id}"
            data-target="${heading.id}"
          >
            ${heading.textContent}
          </a>
        </li>
      `;
    })
    .join("");

  tocEl.innerHTML = `
    <p class="toc-label">On this page</p>
    <ul class="toc-list">${items}</ul>
  `;
}

/** Highlight the TOC entry for whichever heading is currently in view. */
function observeActiveSection() {
  const links = tocEl.querySelectorAll(".toc-list a");

  if (links.length === 0) return;

  const headings = contentEl.querySelectorAll("h2, h3");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        links.forEach((link) =>
          link.classList.remove("active")
        );

        const activeLink = tocEl.querySelector(
          `a[data-target="${entry.target.id}"]`
        );

        activeLink?.classList.add("active");
      });
    },
    {
      rootMargin: "-15% 0px -75% 0px",
      threshold: 0,
    }
  );

  headings.forEach((heading) =>
    observer.observe(heading)
  );
}

/* --------------------------------------------------------------------- */
/* Prev / next                                                            */
/* --------------------------------------------------------------------- */

function renderPagination(index, currentIndex) {
  const prev = index[currentIndex - 1];
  const next = index[currentIndex + 1];

  paginationEl.innerHTML = `
    ${
      prev
        ? `
          <a
            class="pagination-link prev"
            href="tutorial.html?id=${encodeURIComponent(prev.id)}"
          >
            <span class="pagination-direction">
              ← Previous
            </span>

            <span class="pagination-title">
              ${escapeHtml(prev.title)}
            </span>
          </a>
        `
        : `
          <span class="pagination-link pagination-placeholder"></span>
        `
    }

    ${
      next
        ? `
          <a
            class="pagination-link next"
            href="tutorial.html?id=${encodeURIComponent(next.id)}"
          >
            <span class="pagination-direction">
              Next →
            </span>

            <span class="pagination-title">
              ${escapeHtml(next.title)}
            </span>
          </a>
        `
        : `
          <span class="pagination-link pagination-placeholder"></span>
        `
    }
  `;
}

/* --------------------------------------------------------------------- */
/* Missing state                                                          */
/* --------------------------------------------------------------------- */

function renderMissing(message) {
  titleEl.textContent = "Tutorial not found";

  breadcrumbEl.textContent = "Docs";

  metaRowEl.innerHTML = "";

  tocEl.innerHTML = "";

  contentEl.innerHTML = `
    <div class="empty-state">
      <h3>We couldn't load that tutorial</h3>

      <p>${escapeHtml(message)}</p>

      <p>
        <a
          href="index.html"
          style="color: var(--color-accent);"
        >
          ← Back to all tutorials
        </a>
      </p>
    </div>
  `;
}

function clockIconSvg() {
  return `
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      style="width:14px;height:14px;vertical-align:-2px;"
    >
      <circle cx="8" cy="8" r="6.25"/>
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}