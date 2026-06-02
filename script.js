const year = document.querySelector("#year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const categoryGrid = document.querySelector("[data-category-grid]");
const triggers = Array.from(document.querySelectorAll("[data-filter]"));
const tiles = Array.from(document.querySelectorAll("[data-category]"));
const projectGithubNote = document.querySelector(".project-github-note");
const projectGithubLine = document.querySelector(".project-github-line line");
const githubAction = document.querySelector("[data-github-action]");
let pinnedCategory = null;
let activeCategory = null;
let resizeTimer = null;
let lineFrame = null;

const protectedSelectors = [
  "#hero-title",
  ".grid-intro .eyebrow",
  ".intro-line",
  ".grid-trigger",
  ".grid-actions",
];

const categorySeedMaps = {
  desktop: {
    working: [[4, 6], [13, 6], [22, 6], [8, 11], [20, 11]],
    projects: [[4, 6], [12, 6], [21, 6], [27, 11], [14, 11]],
    publications: [[20, 6], [27, 10], [14, 8], [22, 11]],
    skills: [[3, 5], [11, 5], [22, 5], [3, 11], [13, 11], [22, 11]],
    experience: [[4, 6], [13, 7], [22, 8], [8, 11]],
    education: [[16, 6], [23, 6], [20, 11], [10, 10]],
  },
  laptop: {
    working: [[3, 6], [11, 6], [19, 6], [7, 11], [16, 11]],
    projects: [[3, 6], [10, 6], [18, 6], [24, 11], [12, 11]],
    publications: [[16, 6], [23, 10], [11, 9], [18, 11]],
    skills: [[3, 5], [11, 5], [20, 5], [3, 11], [12, 11], [20, 11]],
    experience: [[3, 6], [11, 7], [19, 8], [6, 11]],
    education: [[14, 6], [21, 6], [17, 11], [8, 10]],
  },
  compact: {
    working: [[3, 6], [11, 6], [3, 11], [12, 11], [17, 7]],
    projects: [[3, 6], [11, 6], [3, 11], [12, 11], [17, 7]],
    publications: [[10, 6], [15, 11], [4, 11], [12, 7]],
    skills: [[2, 5], [10, 5], [2, 10], [11, 10], [2, 15], [11, 15]],
    experience: [[3, 6], [11, 7], [3, 11], [13, 11]],
    education: [[10, 6], [16, 6], [10, 11], [3, 11]],
  },
  mobile: {
    working: [[2, 6], [8, 6], [2, 10], [8, 10]],
    projects: [[2, 6], [8, 6], [2, 10], [8, 10]],
    publications: [[2, 6], [8, 6], [2, 10]],
    skills: [[2, 5], [8, 5], [2, 9], [8, 9], [2, 13], [8, 13]],
    experience: [[2, 6], [8, 7], [2, 11]],
    education: [[2, 6], [8, 7], [2, 11]],
  },
};

function getSeedMapName(metrics) {
  if (metrics.rect.width < 700) {
    return "mobile";
  }

  if (metrics.rect.width < 900 || metrics.rows < 16) {
    return "compact";
  }

  if (metrics.rect.width < 1200 || metrics.rows < 19) {
    return "laptop";
  }

  return "desktop";
}

function getCategorySeeds(category, metrics) {
  const mapName = getSeedMapName(metrics);
  return categorySeedMaps[mapName]?.[category] || categorySeedMaps.desktop[category] || [];
}

function getGridMetrics() {
  if (!categoryGrid) {
    return null;
  }

  const gridRect = categoryGrid.getBoundingClientRect();
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.width = "var(--cell)";
  probe.style.height = "var(--cell)";
  categoryGrid.append(probe);
  const cell = probe.getBoundingClientRect().width || 44;
  probe.remove();

  return {
    cell,
    rect: gridRect,
    cols: Math.max(1, Math.floor(gridRect.width / cell)),
    rows: Math.max(1, Math.floor(gridRect.height / cell)),
  };
}

function getTileSize(tile, metrics) {
  const style = getComputedStyle(tile);
  const minWidth = parseInt(tile.dataset.minW, 10) || 5;
  const minHeight = parseInt(tile.dataset.minH, 10) || 4;
  let width = Math.max(parseInt(style.getPropertyValue("--w"), 10) || 1, minWidth);
  let height = Math.max(parseInt(style.getPropertyValue("--h"), 10) || 1, minHeight);
  const isSkillGroup = tile.classList.contains("skill-group-tile");

  if (window.matchMedia("(max-width: 560px)").matches) {
    width = Math.max(Math.min(width, isSkillGroup ? 9 : 8), Math.min(minWidth, 8));
    height = Math.max(Math.min(height, isSkillGroup ? 7 : 5), Math.min(minHeight, 5));
  } else if (window.matchMedia("(max-width: 900px)").matches) {
    width = Math.max(Math.min(width, isSkillGroup ? 10 : 8), minWidth);
    height = Math.max(Math.min(height, isSkillGroup ? 7 : 5), minHeight);
  }

  return {
    width: Math.max(1, Math.min(width, metrics.cols - 3)),
    height: Math.max(1, Math.min(height, metrics.rows - 4)),
  };
}

function rectsCollide(a, b) {
  return a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row;
}

function elementToGridRect(element, metrics, buffer = 1) {
  const rect = element.getBoundingClientRect();

  return {
    col: Math.max(1, Math.floor((rect.left - metrics.rect.left) / metrics.cell) + 1 - buffer),
    row: Math.max(1, Math.floor((rect.top - metrics.rect.top) / metrics.cell) + 1 - buffer),
    width: Math.min(
      metrics.cols,
      Math.ceil(rect.width / metrics.cell) + buffer * 2
    ),
    height: Math.min(
      metrics.rows,
      Math.ceil(rect.height / metrics.cell) + buffer * 2
    ),
  };
}

function getReservedAreas(metrics) {
  const reserved = [
    { col: 1, row: 1, width: metrics.cols, height: 1 },
    { col: 1, row: metrics.rows, width: metrics.cols, height: 1 },
    { col: 1, row: 1, width: 1, height: metrics.rows },
    { col: metrics.cols, row: 1, width: 1, height: metrics.rows },
  ];

  protectedSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      reserved.push(elementToGridRect(element, metrics, selector === ".grid-actions" ? 2 : 1));
    });
  });

  return reserved;
}

function isFree(slot, occupied, metrics) {
  if (
    slot.col < 2 ||
    slot.row < 2 ||
    slot.col + slot.width > metrics.cols ||
    slot.row + slot.height > metrics.rows
  ) {
    return false;
  }

  return !occupied.some((area) => rectsCollide(slot, area));
}

function getCandidateSlots(category, tile, metrics) {
  const { width, height } = getTileSize(tile, metrics);
  const seeds = getCategorySeeds(category, metrics);
  const candidates = seeds.map(([col, row]) => ({ col, row, width, height }));
  const preferredCol = parseInt(tile.style.getPropertyValue("--col"), 10);
  const preferredRow = parseInt(tile.style.getPropertyValue("--row"), 10);

  if (preferredCol && preferredRow) {
    candidates.push({ col: preferredCol, row: preferredRow, width, height });
  }

  for (let row = 2; row <= metrics.rows - height; row += 1) {
    for (let col = 2; col <= metrics.cols - width; col += 1) {
      candidates.push({ col, row, width, height });
    }
  }

  return candidates;
}

function placeTiles(category) {
  if (!categoryGrid || !category) {
    tiles.forEach((tile) => tile.classList.remove("is-layout-hidden"));
    return new Set();
  }

  const metrics = getGridMetrics();
  const occupied = getReservedAreas(metrics);
  const placed = new Set();

  tiles.forEach((tile) => {
    const categories = (tile.dataset.category || "").split(/\s+/);
    const isMatch = categories.includes(category);

    tile.classList.remove("is-layout-hidden");

    if (!isMatch) {
      return;
    }

    const slot = getCandidateSlots(category, tile, metrics).find((candidate) => (
      isFree(candidate, occupied, metrics)
    ));

    if (!slot) {
      tile.classList.add("is-layout-hidden");
      return;
    }

    tile.style.setProperty("--col", String(slot.col));
    tile.style.setProperty("--row", String(slot.row));
    tile.style.setProperty("--w", String(slot.width));
    tile.style.setProperty("--h", String(slot.height));
    occupied.push({ ...slot, width: slot.width + 1, height: slot.height + 1 });
    placed.add(tile);
  });

  return placed;
}

function getLineEndpointBeforeRect(start, targetRect, gap = 16) {
  const center = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };
  const dx = center.x - start.x;
  const dy = center.y - start.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return center;
  }

  const tx1 = dx ? (targetRect.left - start.x) / dx : -Infinity;
  const tx2 = dx ? (targetRect.right - start.x) / dx : Infinity;
  const ty1 = dy ? (targetRect.top - start.y) / dy : -Infinity;
  const ty2 = dy ? (targetRect.bottom - start.y) / dy : Infinity;
  const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
  const boundary = Number.isFinite(tNear) && tNear > 0 && tNear < 1
    ? {
      x: start.x + dx * tNear,
      y: start.y + dy * tNear,
    }
    : {
      x: center.x - (dx / length) * gap,
      y: center.y - (dy / length) * gap,
    };

  return {
    x: boundary.x - (dx / length) * gap,
    y: boundary.y - (dy / length) * gap,
  };
}

function updateProjectGithubLine() {
  if (!categoryGrid || !projectGithubNote || !projectGithubLine || !githubAction) {
    return;
  }

  const noteText = projectGithubNote.querySelector("span");

  if (activeCategory !== "projects" || !noteText) {
    projectGithubLine.setAttribute("x1", "0");
    projectGithubLine.setAttribute("y1", "0");
    projectGithubLine.setAttribute("x2", "0");
    projectGithubLine.setAttribute("y2", "0");
    return;
  }

  const containerRect = categoryGrid.getBoundingClientRect();
  const textRect = noteText.getBoundingClientRect();
  const buttonRect = githubAction.getBoundingClientRect();
  const start = {
    x: textRect.right,
    y: textRect.top + textRect.height * 0.55,
  };
  const end = getLineEndpointBeforeRect(start, buttonRect, 16);

  projectGithubLine.setAttribute("x1", String(start.x - containerRect.left));
  projectGithubLine.setAttribute("y1", String(start.y - containerRect.top));
  projectGithubLine.setAttribute("x2", String(end.x - containerRect.left));
  projectGithubLine.setAttribute("y2", String(end.y - containerRect.top));
}

function scheduleProjectGithubLineUpdate() {
  window.cancelAnimationFrame(lineFrame);
  lineFrame = window.requestAnimationFrame(updateProjectGithubLine);
}

function setActiveCategory(category) {
  activeCategory = category;
  const placedTiles = placeTiles(category);

  categoryGrid?.setAttribute("data-active-category", category || "");

  triggers.forEach((trigger) => {
    const isActive = trigger.dataset.filter === category;
    trigger.setAttribute("aria-pressed", String(isActive));
  });

  tiles.forEach((tile) => {
    const categories = (tile.dataset.category || "").split(/\s+/);
    const isMatch = Boolean(category && categories.includes(category) && placedTiles.has(tile));

    tile.classList.toggle("is-active", isMatch);
    tile.classList.toggle("is-muted", Boolean(category && !isMatch));
    tile.setAttribute("aria-hidden", String(!isMatch));
  });

  scheduleProjectGithubLineUpdate();
}

window.setActiveCategory = setActiveCategory;

function clearActiveCategory() {
  pinnedCategory = null;
  setActiveCategory(null);
}

setActiveCategory(null);
window.addEventListener("load", scheduleProjectGithubLineUpdate);

triggers.forEach((trigger) => {
  const category = trigger.dataset.filter;

  trigger.addEventListener("pointerenter", () => {
    if (!pinnedCategory) {
      setActiveCategory(category);
    }
  });

  trigger.addEventListener("focus", () => {
    if (!pinnedCategory) {
      setActiveCategory(category);
    }
  });

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    pinnedCategory = pinnedCategory === category ? null : category;
    setActiveCategory(pinnedCategory);
  });
});

categoryGrid?.addEventListener("pointerleave", () => {
  if (!pinnedCategory) {
    setActiveCategory(null);
  }
});

document.addEventListener("click", (event) => {
  if (categoryGrid && !categoryGrid.contains(event.target)) {
    clearActiveCategory();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearActiveCategory();
  }
});

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    setActiveCategory(activeCategory);
    scheduleProjectGithubLineUpdate();
  }, 120);
});
