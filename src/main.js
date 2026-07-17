import { stories } from "./stories.js";

const state = {
  route: "gallery",
  storyId: stories[0].id,
  slideIndex: 0,
  isPlaying: false,
  motion: "story",
  chromeVisible: true,
  textVisible: true,
  controlsMinimized: false
};

let playTimer = null;
let chromeTimer = null;
let activeSceneLayer = 0;
let sceneTransitionId = 0;
let swipeStart = null;
let suppressStageClick = false;
let slideElapsedMs = 0;
let playbackStartedAt = null;
let progressFrame = null;
let scrubGesture = null;
let transitionDirection = 1;

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

function storyTiming() {
  const durations = selectedStory().slides.map(slideDuration);
  return {
    durations,
    total: durations.reduce((sum, duration) => sum + duration, 0),
    before: durations.slice(0, state.slideIndex).reduce((sum, duration) => sum + duration, 0)
  };
}

function currentSlideElapsed() {
  if (!state.isPlaying || playbackStartedAt === null) return slideElapsedMs;
  return slideElapsedMs + performance.now() - playbackStartedAt;
}

function timelineValue() {
  const timing = storyTiming();
  const elapsed = Math.min(currentSlideElapsed(), timing.durations[state.slideIndex]);
  return timing.total ? ((timing.before + elapsed) / timing.total) * 1000 : 0;
}

function updateTimelineUI(value = timelineValue()) {
  const timeline = app.querySelector("[data-action='timeline']");
  if (!timeline) return;
  const bounded = Math.max(0, Math.min(1000, value));
  timeline.value = String(bounded);
  timeline.style.setProperty("--progress", `${bounded / 10}%`);
  timeline.setAttribute("aria-valuetext", `Scène ${state.slideIndex + 1} sur ${selectedStory().slides.length}`);
}

function runProgressAnimation() {
  cancelAnimationFrame(progressFrame);
  const tick = () => {
    if (!state.isPlaying) return;
    updateTimelineUI();
    progressFrame = requestAnimationFrame(tick);
  };
  progressFrame = requestAnimationFrame(tick);
}

function seekTimeline(value) {
  const story = selectedStory();
  const durations = story.slides.map(slideDuration);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  let target = Math.max(0, Math.min(1, value / 1000)) * total;
  let nextIndex = durations.length - 1;

  for (let index = 0; index < durations.length; index += 1) {
    if (target < durations[index] || index === durations.length - 1) {
      nextIndex = index;
      slideElapsedMs = Math.min(target, durations[index] - 1);
      break;
    }
    target -= durations[index];
  }

  if (nextIndex !== state.slideIndex) {
    transitionDirection = nextIndex > state.slideIndex ? 1 : -1;
    setState({ slideIndex: nextIndex });
  }
  updateTimelineUI(value);
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
    if (cancelled || Math.abs(dx) < 48) {
      resetSwipe();
      return;
    }
    const direction = dx < 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(selectedStory().slides.length - 1, state.slideIndex + direction));
    if (nextIndex === state.slideIndex) {
      resetSwipe();
      return;
    }
    suppressStageClick = true;
    swipeStart = null;
    art.classList.remove("is-swiping");
    stopPlayback();
    moveSlide(direction);
    setTimeout(() => { suppressStageClick = false; }, 520);
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

    const directionName = transitionDirection > 0 ? "forward" : "backward";
    nextLayer.className = `scene-layer is-preparing-${directionName}`;
    oldLayer.classList.remove("is-exiting-forward", "is-exiting-backward");
    nextLayer.getBoundingClientRect();
    oldLayer.classList.add(`is-exiting-${directionName}`);
    nextLayer.classList.add("is-active");
    nextLayer.classList.remove(`is-preparing-${directionName}`);
    activeSceneLayer = nextLayerIndex;

    setTimeout(() => {
      if (transitionId !== sceneTransitionId) return;
      oldLayer.className = "scene-layer";
    }, 560);

    const motion = state.motion === "story" ? slide.motion : state.motion;
    art.className = `scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}`;
    art.style.setProperty("--swipe-offset", "0px");
    art.dataset.slide = String(state.slideIndex);
  }

  const copy = app.querySelector(".scene-copy");
  copy.querySelector("p").textContent = slide.text;
  copy.classList.toggle("is-hidden", !state.textVisible);
  if (slideChanged && state.textVisible) {
    copy.classList.remove("is-entering");
    requestAnimationFrame(() => copy.classList.add("is-entering"));
  } else if (!state.textVisible) {
    copy.classList.remove("is-entering");
  }

  shell.classList.toggle("is-playing", state.isPlaying);
  shell.classList.toggle("chrome-visible", state.chromeVisible);
  updateTimelineUI();
  app.querySelector("[data-action='previous']").disabled = state.slideIndex === 0;
  app.querySelector("[data-action='next']").disabled = state.slideIndex === story.slides.length - 1;
  const playButton = app.querySelector("[data-action='play']");
  playButton?.setAttribute("aria-label", state.isPlaying ? "Mettre en pause" : "Lire l'histoire");
  playButton?.setAttribute("aria-pressed", String(state.isPlaying));
  if (playButton?.firstElementChild) {
    playButton.firstElementChild.className = state.isPlaying ? "pause-icon" : "play-icon";
  }
  const textButton = app.querySelector("[data-action='toggle-text']");
  textButton?.setAttribute("aria-pressed", String(state.textVisible));
  const controlIsland = app.querySelector(".control-island");
  controlIsland?.classList.toggle("is-minimized", state.controlsMinimized);
  const minimizeButton = app.querySelector("[data-action='toggle-controls']");
  minimizeButton?.setAttribute("aria-label", state.controlsMinimized ? "Agrandir les commandes" : "Réduire les commandes");
  minimizeButton?.setAttribute("aria-expanded", String(!state.controlsMinimized));
  preloadNearbySlides();
  return true;
}

function resetViewport() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function goToGallery() {
  stopPlayback();
  slideElapsedMs = 0;
  setState({ route: "gallery", slideIndex: 0 });
  resetViewport();
}

function openStory(id) {
  stopPlayback();
  slideElapsedMs = 0;
  setState({ route: "reader", storyId: id, slideIndex: 0 });
  resetViewport();
}

function moveSlide(direction) {
  const story = selectedStory();
  const nextIndex = Math.max(0, Math.min(story.slides.length - 1, state.slideIndex + direction));
  if (nextIndex === state.slideIndex) return;
  transitionDirection = direction;
  slideElapsedMs = 0;
  playbackStartedAt = state.isPlaying ? performance.now() : null;
  setState({ slideIndex: nextIndex });
  if (nextIndex === story.slides.length - 1 && direction > 0) {
    stopPlayback();
  }
}

function stopPlayback() {
  if (state.isPlaying) {
    slideElapsedMs = Math.min(currentSlideElapsed(), slideDuration(currentSlide()));
  }
  state.isPlaying = false;
  playbackStartedAt = null;
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  cancelAnimationFrame(progressFrame);
  progressFrame = null;
  showReaderChrome({ persist: true });
  app.querySelector(".reader-shell")?.classList.remove("is-playing");
  updateTimelineUI();
}

function scheduleNextSlide() {
  if (!state.isPlaying) return;
  clearTimeout(playTimer);
  playbackStartedAt = performance.now();
  const remaining = Math.max(80, slideDuration(currentSlide()) - slideElapsedMs);
  playTimer = setTimeout(() => {
    const story = selectedStory();
    if (state.slideIndex >= story.slides.length - 1) {
      slideElapsedMs = slideDuration(currentSlide());
      stopPlayback();
      render();
      return;
    }
    slideElapsedMs = 0;
    playbackStartedAt = null;
    setState({ slideIndex: state.slideIndex + 1 });
    scheduleNextSlide();
  }, remaining);
  runProgressAnimation();
}

function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
    render();
    return;
  }

  const story = selectedStory();
  if (state.slideIndex >= story.slides.length - 1 && slideElapsedMs >= slideDuration(currentSlide()) - 1) {
    state.slideIndex = 0;
    slideElapsedMs = 0;
  }

  state.isPlaying = true;
  playbackStartedAt = null;
  render();
  scheduleNextSlide();
  showReaderChrome();
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
  const progress = timelineValue();

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
          <div class="scene-copy${state.textVisible ? "" : " is-hidden"}">
            <p>${slide.text}</p>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="control-island${state.controlsMinimized ? " is-minimized" : ""}">
          <button class="island-button island-expanded" type="button" data-action="previous" aria-label="Scène précédente" ${state.slideIndex === 0 ? "disabled" : ""}>
            <span class="chevron is-left" aria-hidden="true"></span>
          </button>
          <button class="island-button island-expanded play-toggle" type="button" data-action="play" aria-label="${state.isPlaying ? "Mettre en pause" : "Lire l'histoire"}" aria-pressed="${state.isPlaying}">
            <span class="${state.isPlaying ? "pause-icon" : "play-icon"}" aria-hidden="true"></span>
          </button>
          <button class="island-button island-expanded" type="button" data-action="next" aria-label="Scène suivante" ${state.slideIndex === story.slides.length - 1 ? "disabled" : ""}>
            <span class="chevron is-right" aria-hidden="true"></span>
          </button>
          <div class="timeline-track">
            <input data-action="timeline" type="range" min="0" max="1000" step="1" value="${progress}" aria-label="Lire, mettre en pause ou parcourir l'histoire" aria-valuetext="Scène ${state.slideIndex + 1} sur ${story.slides.length}" style="--progress: ${progress / 10}%" />
          </div>
          <button class="island-button island-expanded text-toggle" type="button" data-action="toggle-text" aria-label="Afficher ou masquer le texte" aria-pressed="${state.textVisible}">
            <span aria-hidden="true">Aa</span>
          </button>
          <button class="island-button minimize-toggle" type="button" data-action="toggle-controls" aria-label="${state.controlsMinimized ? "Agrandir les commandes" : "Réduire les commandes"}" aria-expanded="${!state.controlsMinimized}">
            <span class="island-collapse-icon" aria-hidden="true"></span>
          </button>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
  document.querySelector("[data-action='toggle-text']").addEventListener("click", () => {
    state.textVisible = !state.textVisible;
    updateReader();
    showReaderChrome({ persist: true });
  });
  document.querySelector("[data-action='toggle-controls']").addEventListener("click", () => {
    state.controlsMinimized = !state.controlsMinimized;
    updateReader();
    showReaderChrome({ persist: true });
  });
  document.querySelector("[data-action='previous']").addEventListener("click", () => {
    stopPlayback();
    moveSlide(-1);
  });
  document.querySelector("[data-action='next']").addEventListener("click", () => {
    stopPlayback();
    moveSlide(1);
  });
  const timeline = document.querySelector("[data-action='timeline']");
  timeline.addEventListener("pointerdown", () => {
    showReaderChrome({ persist: true });
    scrubGesture = { wasPlaying: state.isPlaying, startValue: Number(timeline.value), changed: false };
    if (state.isPlaying) stopPlayback();
  });
  timeline.addEventListener("input", () => {
    const value = Number(timeline.value);
    if (!scrubGesture) {
      scrubGesture = { wasPlaying: false, startValue: value, changed: true };
      stopPlayback();
    }
    scrubGesture.changed ||= Math.abs(value - scrubGesture.startValue) > 3;
    seekTimeline(value);
  });
  timeline.addEventListener("pointerup", () => {
    const gesture = scrubGesture;
    scrubGesture = null;
    if (gesture?.wasPlaying && !gesture.changed) {
      render();
      return;
    }
    if (!state.isPlaying) togglePlayback();
    else showReaderChrome();
  });
  timeline.addEventListener("pointercancel", () => {
    scrubGesture = null;
    render();
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
    slideElapsedMs = Math.min(currentSlideElapsed(), slideDuration(currentSlide()));
    playbackStartedAt = null;
    clearTimeout(playTimer);
    playTimer = null;
    cancelAnimationFrame(progressFrame);
    progressFrame = null;
  } else {
    scheduleNextSlide();
  }
});

render();
