import { stories } from "./stories.js";

const state = {
  route: "gallery",
  storyId: stories[0].id,
  slideIndex: 0,
  isPlaying: false,
  motion: "story",
  textVisible: true,
  chromeVisible: true
};

let playTimer = null;
let chromeTimer = null;
let activeSceneLayer = 0;
let sceneTransitionId = 0;
let scrubTimer = null;
let swipeStart = null;
let suppressStageClick = false;

const app = document.querySelector("#app");

function selectedStory() {
  return stories.find((story) => story.id === state.storyId) || stories[0];
}

function currentSlide() {
  return selectedStory().slides[state.slideIndex];
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function availableStories() {
  return stories.filter((story) => story.coverImage && story.slides.some((slide) => slide.image));
}

function slideDuration(slide) {
  const wordCount = slide.text.trim().split(/\s+/).length;
  return Math.max(6500, Math.min(12000, 3000 + wordCount * 290));
}

function clearChromeTimer() {
  if (chromeTimer) clearTimeout(chromeTimer);
  chromeTimer = null;
}

function showReaderChrome({ persist = false } = {}) {
  if (state.route !== "reader") return;
  clearChromeTimer();
  state.chromeVisible = true;
  app.querySelector(".reader-shell")?.classList.add("chrome-visible");
  if (!persist && state.isPlaying) {
    chromeTimer = setTimeout(() => {
      state.chromeVisible = false;
      app.querySelector(".reader-shell")?.classList.remove("chrome-visible");
    }, 2600);
  }
}

function slideImageMarkup(slide) {
  const mobileSource = slide.mobileImage
    ? `<source media="(max-width: 759px)" srcset="${slide.mobileImage}">`
    : "";
  return `${mobileSource}<img src="${slide.image || ""}" alt="" decoding="async">`;
}

function preloadNearbySlides() {
  const slides = selectedStory().slides;
  [state.slideIndex + 1, state.slideIndex - 1].forEach((index) => {
    const slide = slides[index];
    if (!slide?.image) return;
    const image = new Image();
    image.src = window.matchMedia("(max-width: 759px)").matches && slide.mobileImage
      ? slide.mobileImage
      : slide.image;
  });
}

function bindSwipeNavigation() {
  const stage = app.querySelector(".stage");
  const art = app.querySelector(".scene-art");
  if (!stage || !art) return;

  const resetSwipe = () => {
    art.classList.remove("is-swiping");
    art.style.setProperty("--swipe-offset", "0px");
    swipeStart = null;
  };

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target.closest("button, input")) return;
    swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, cancelled: false };
    stage.setPointerCapture?.(event.pointerId);
    art.classList.add("is-swiping");
  });

  stage.addEventListener("pointermove", (event) => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      swipeStart.cancelled = true;
      art.style.setProperty("--swipe-offset", "0px");
      return;
    }
    if (swipeStart.cancelled) return;
    swipeStart.dx = dx;
    const story = selectedStory();
    const atEdge = (state.slideIndex === 0 && dx > 0)
      || (state.slideIndex === story.slides.length - 1 && dx < 0);
    art.style.setProperty("--swipe-offset", `${atEdge ? dx * 0.22 : dx * 0.48}px`);
  });

  const finishSwipe = (event) => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const { dx, cancelled } = swipeStart;
    resetSwipe();
    if (cancelled || Math.abs(dx) < 48) return;
    suppressStageClick = true;
    setTimeout(() => { suppressStageClick = false; }, 240);
    stopPlayback();
    moveSlide(dx < 0 ? 1 : -1);
  };

  stage.addEventListener("pointerup", finishSwipe);
  stage.addEventListener("pointercancel", resetSwipe);
  stage.addEventListener("click", () => {
    if (suppressStageClick) return;
    if (state.chromeVisible) {
      clearChromeTimer();
      state.chromeVisible = false;
      app.querySelector(".reader-shell")?.classList.remove("chrome-visible");
    } else {
      showReaderChrome();
    }
  });
}

async function updateReader() {
  const shell = app.querySelector(".reader-shell");
  if (!shell) return false;

  const story = selectedStory();
  const slide = currentSlide();
  const art = app.querySelector(".scene-art");
  const slideChanged = Number(art.dataset.slide) !== state.slideIndex;

  if (slideChanged) {
    const transitionId = ++sceneTransitionId;
    const nextLayerIndex = activeSceneLayer === 0 ? 1 : 0;
    const layers = app.querySelectorAll(".scene-layer");
    const nextLayer = layers[nextLayerIndex];
    const oldLayer = layers[activeSceneLayer];
    const source = nextLayer.querySelector("source");
    const image = nextLayer.querySelector("img");

    if (slide.mobileImage) {
      if (source) source.srcset = slide.mobileImage;
      else image.insertAdjacentHTML("beforebegin", `<source media="(max-width: 759px)" srcset="${slide.mobileImage}">`);
    } else if (source) {
      source.remove();
    }
    image.src = slide.image || "";

    try {
      await image.decode();
    } catch {
      // The load event remains a valid fallback when decode() is unavailable.
    }
    if (transitionId !== sceneTransitionId) return true;

    nextLayer.classList.add("is-active");
    oldLayer.classList.remove("is-active");
    activeSceneLayer = nextLayerIndex;

    const motion = state.motion === "story" ? slide.motion : state.motion;
    art.className = `scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}`;
    art.dataset.slide = String(state.slideIndex);
  }

  const copy = app.querySelector(".scene-copy");
  copy.classList.toggle("is-hidden", !state.textVisible);
  copy.querySelector("p").textContent = slide.text;
  if (slideChanged) {
    copy.classList.remove("is-entering");
    requestAnimationFrame(() => copy.classList.add("is-entering"));
  }

  shell.classList.toggle("is-playing", state.isPlaying);
  shell.classList.toggle("chrome-visible", state.chromeVisible);
  const playButton = app.querySelector("[data-action='play']");
  playButton.classList.toggle("is-playing", state.isPlaying);
  playButton.setAttribute("aria-pressed", String(state.isPlaying));
  playButton.setAttribute("aria-label", state.isPlaying ? "Mettre en pause" : "Lire l'histoire");
  playButton.querySelector(".play-text").textContent = state.isPlaying ? "Pause" : "Lire";
  const textButton = app.querySelector("[data-action='toggle-text']");
  textButton.setAttribute("aria-pressed", String(state.textVisible));
  textButton.setAttribute("aria-label", state.textVisible ? "Masquer le texte" : "Afficher le texte");
  const scrubber = app.querySelector("[data-action='scrub']");
  scrubber.value = String(state.slideIndex);
  scrubber.style.setProperty("--progress", `${story.slides.length === 1 ? 100 : (state.slideIndex / (story.slides.length - 1)) * 100}%`);
  app.querySelector(".slide-count").textContent = `${state.slideIndex + 1}/${story.slides.length}`;
  app.querySelector("[data-action='previous']").disabled = state.slideIndex === 0;
  app.querySelector("[data-action='next']").disabled = state.slideIndex === story.slides.length - 1;
  preloadNearbySlides();
  return true;
}

function resetViewport() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function goToGallery() {
  stopPlayback();
  setState({ route: "gallery", slideIndex: 0 });
  resetViewport();
}

function openStory(id) {
  stopPlayback();
  setState({ route: "reader", storyId: id, slideIndex: 0 });
  resetViewport();
}

function moveSlide(direction) {
  const story = selectedStory();
  const nextIndex = Math.max(0, Math.min(story.slides.length - 1, state.slideIndex + direction));
  setState({ slideIndex: nextIndex });
  if (nextIndex === story.slides.length - 1 && direction > 0) {
    stopPlayback();
  }
}

function stopPlayback() {
  state.isPlaying = false;
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  showReaderChrome({ persist: true });
}

function scheduleNextSlide() {
  if (!state.isPlaying) return;
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    const story = selectedStory();
    if (state.slideIndex >= story.slides.length - 1) {
      stopPlayback();
      render();
      return;
    }
    setState({ slideIndex: state.slideIndex + 1 });
    scheduleNextSlide();
  }, slideDuration(currentSlide()));
}

function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
    render();
    return;
  }

  const story = selectedStory();
  if (state.slideIndex >= story.slides.length - 1) {
    state.slideIndex = 0;
  }

  state.isPlaying = true;
  render();
  scheduleNextSlide();
  showReaderChrome();
}

function toggleStoryText() {
  setState({ textVisible: !state.textVisible });
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

function fullscreenTarget() {
  return document.documentElement;
}

function updateFullscreenButton() {
  const button = document.querySelector("[data-action='fullscreen']");
  if (!button) {
    return;
  }

  const isFullscreen = Boolean(fullscreenElement());
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.setAttribute("aria-label", isFullscreen ? "Quitter le plein écran" : "Plein écran");
}

async function toggleFullscreen() {
  const activeElement = fullscreenElement();

  try {
    if (activeElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return;
    }

    const target = fullscreenTarget();
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } finally {
    updateFullscreenButton();
  }
}

function renderGallery() {
  const library = availableStories();
  const featured = library[0];
  const secondaryStories = library.slice(1);
  const mobileCover = featured.slides[0]?.mobileImage || featured.coverImage;
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="Kidory">
          <span class="brand-mark">Kidory</span>
        </div>
        <span class="library-label">Histoires</span>
      </header>

      <section class="featured ${secondaryStories.length ? "has-rail" : "is-solo"}" aria-labelledby="featured-title">
        <picture class="featured-art" aria-hidden="true">
          <source media="(max-width: 759px)" srcset="${mobileCover}">
          <img src="${featured.coverImage}" alt="" fetchpriority="high">
        </picture>
        <div class="featured-content">
          <span class="featured-eyebrow">À la une</span>
          <h1 class="featured-title" id="featured-title">${featured.title}</h1>
          <div class="featured-meta" aria-label="Informations">
            <span>${featured.ageRange}</span>
            <span>${featured.duration}</span>
            <span>${featured.topic}</span>
          </div>
          <p class="featured-summary">${featured.summary}</p>
          <button class="primary-action" data-story-id="${featured.id}" type="button">
            <span class="action-play" aria-hidden="true"></span>
            Lire
          </button>
        </div>
      </section>

      ${secondaryStories.length ? `
        <section class="library-rail">
          <div class="rail-header"><h2>À découvrir</h2></div>
          <div class="story-rail" aria-label="Histoires disponibles">
            ${secondaryStories.map(renderStoryCard).join("")}
          </div>
        </section>
      ` : ""}
    </main>
  `;

  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyId));
  });
}

function renderStoryCard(story) {
  const mobileCover = story.slides[0]?.mobileImage || story.coverImage;
  return `
    <button class="story-card" data-story-id="${story.id}" type="button">
      <picture class="story-poster" aria-hidden="true">
        <img src="${mobileCover}" alt="" loading="lazy" decoding="async">
      </picture>
      <span class="card-content">
        <span class="card-title">${story.title}</span>
        <span class="card-meta">${story.ageRange} · ${story.duration}</span>
      </span>
    </button>
  `;
}

function renderReader() {
  const story = selectedStory();
  const slide = currentSlide();
  const motion = state.motion === "story" ? slide.motion : state.motion;
  const progress = story.slides.length === 1 ? 100 : (state.slideIndex / (story.slides.length - 1)) * 100;
  const playLabel = state.isPlaying ? "Mettre en pause" : "Lire l'histoire";

  app.innerHTML = `
    <main class="reader-shell ${state.isPlaying ? "is-playing" : ""} ${state.chromeVisible ? "chrome-visible" : ""}">
      <header class="reader-topbar">
        <button class="icon-button library-button" type="button" data-action="gallery" aria-label="Retour à la bibliothèque">
          <span class="back-icon" aria-hidden="true"></span>
        </button>
        <div class="reader-title">
          <strong>${story.title}</strong>
        </div>
        <button class="icon-button fullscreen-button" type="button" data-action="fullscreen" aria-label="Plein écran" aria-pressed="false">
          <span class="fullscreen-icon" aria-hidden="true"></span>
        </button>
      </header>

      <section class="stage" aria-live="polite">
        <div class="scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}" data-slide="${state.slideIndex}">
          <picture class="scene-layer is-active" aria-hidden="true">${slideImageMarkup(slide)}</picture>
          <picture class="scene-layer" aria-hidden="true"><img alt="" decoding="async"></picture>
          <div class="scene-copy ${state.textVisible ? "" : "is-hidden"}">
            <p>${slide.text}</p>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="timeline-row">
          <input data-action="scrub" type="range" min="0" max="${story.slides.length - 1}" value="${state.slideIndex}" aria-label="Progression de l'histoire" style="--progress: ${progress}%" />
          <span class="slide-count">${state.slideIndex + 1} / ${story.slides.length}</span>
        </div>
        <div class="transport">
          <button class="transport-button previous-button" type="button" data-action="previous" aria-label="Page précédente" ${state.slideIndex === 0 ? "disabled" : ""}>
            <span class="skip-icon is-previous" aria-hidden="true"></span>
          </button>
          <button class="play-button ${state.isPlaying ? "is-playing" : ""}" type="button" data-action="play" aria-label="${playLabel}" aria-pressed="${state.isPlaying}">
            <span class="play-icon" aria-hidden="true"></span>
            <span class="play-text">${state.isPlaying ? "Pause" : "Lire"}</span>
          </button>
          <button class="transport-button next-button" type="button" data-action="next" aria-label="Page suivante" ${state.slideIndex === story.slides.length - 1 ? "disabled" : ""}>
            <span class="skip-icon is-next" aria-hidden="true"></span>
          </button>
          <span class="transport-spacer"></span>
          <button class="text-toggle" type="button" data-action="toggle-text" aria-pressed="${state.textVisible}" aria-label="${state.textVisible ? "Masquer le texte" : "Afficher le texte"}">Aa</button>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
  document.querySelector("[data-action='previous']").addEventListener("click", () => {
    stopPlayback();
    moveSlide(-1);
  });
  document.querySelector("[data-action='next']").addEventListener("click", () => {
    stopPlayback();
    moveSlide(1);
  });
  document.querySelector("[data-action='toggle-text']").addEventListener("click", toggleStoryText);
  document.querySelector("[data-action='scrub']").addEventListener("input", (event) => {
    stopPlayback();
    const nextIndex = Number(event.target.value);
    const nextProgress = story.slides.length === 1 ? 100 : (nextIndex / (story.slides.length - 1)) * 100;
    event.target.style.setProperty("--progress", `${nextProgress}%`);
    document.querySelector(".slide-count").textContent = `${nextIndex + 1}/${story.slides.length}`;
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(() => setState({ slideIndex: nextIndex }), 90);
  });
  updateFullscreenButton();
  activeSceneLayer = 0;
  preloadNearbySlides();
  bindSwipeNavigation();
}

function render() {
  document.body.dataset.route = state.route;
  if (state.route === "gallery") {
    renderGallery();
  } else {
    if (!app.querySelector(".reader-shell")) {
      renderReader();
    } else {
      updateReader();
    }
  }
}

document.addEventListener("keydown", (event) => {
  if (state.route !== "reader") {
    return;
  }

  if (event.key === "ArrowLeft") {
    stopPlayback();
    moveSlide(-1);
  }

  if (event.key === "ArrowRight") {
    stopPlayback();
    moveSlide(1);
  }

  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
document.addEventListener("visibilitychange", () => {
  if (!state.isPlaying) return;
  if (document.hidden) {
    clearTimeout(playTimer);
    playTimer = null;
  } else {
    scheduleNextSlide();
  }
});

render();
