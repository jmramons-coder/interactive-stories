import { stories } from "./stories.js";

const STORAGE_KEY = "kidory-library-v1";

function loadLibraryState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      liked: Array.isArray(saved.liked) ? saved.liked : [],
      bookmarked: Array.isArray(saved.bookmarked) ? saved.bookmarked : []
    };
  } catch {
    return { liked: [], bookmarked: [] };
  }
}

const libraryState = loadLibraryState();

const state = {
  route: "gallery",
  storyId: stories[0].id,
  slideIndex: 0,
  isPlaying: false,
  motion: "story",
  chromeVisible: true,
  textVisible: true,
  narrationEnabled: false
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
let currentUtterance = null;
let narrationTimer = null;
let narrationRunId = 0;

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
  return stories.filter((story) => story.status === "published" && story.coverImage && story.slides?.some((slide) => slide.image));
}

function upcomingStories() {
  return stories.filter((story) => story.status === "upcoming");
}

function persistLibraryState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(libraryState));
  } catch {
    // Engagement still works for the current session when storage is restricted.
  }
}

function hasEngagement(type, id) {
  return libraryState[type].includes(id);
}

function toggleEngagement(type, id) {
  const values = libraryState[type];
  const index = values.indexOf(id);
  if (index >= 0) values.splice(index, 1);
  else values.push(id);
  persistLibraryState();
  const isActive = values.includes(id);
  const attribute = type === "liked" ? "data-like-id" : "data-bookmark-id";
  document.querySelectorAll(`[${attribute}="${id}"]`).forEach((button) => {
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    if (type === "liked") button.setAttribute("aria-label", isActive ? "Retirer des coups de cœur" : "Ajouter aux coups de cœur");
    else button.setAttribute("aria-label", isActive ? "Retirer des histoires gardées" : "Garder pour plus tard");
  });
}

function storyUrl(story) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("story", story.id);
  return url.toString();
}

function showToast(message) {
  document.querySelector(".app-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  }, 2200);
}

async function shareStory(story) {
  const shareData = {
    title: story.title,
    text: `${story.title} — une histoire interactive Kidory`,
    url: storyUrl(story)
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showToast("Lien de l'histoire copié");
  } catch {
    window.prompt("Copiez ce lien", shareData.url);
  }
}

function openPrintOrder(story) {
  document.querySelector(".print-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "print-dialog";
  const subject = encodeURIComponent(`Commande papier — ${story.title}`);
  const body = encodeURIComponent(`Bonjour,\n\nJe souhaite commander un exemplaire papier de « ${story.title} ».\n\nMerci.`);
  dialog.innerHTML = `
    <div class="print-sheet">
      <button class="dialog-close" type="button" aria-label="Fermer"><span aria-hidden="true"></span></button>
      <picture class="print-cover" aria-hidden="true"><img src="${story.slides[0].mobileImage || story.coverImage}" alt=""></picture>
      <div class="print-copy">
        <span class="print-label">Édition papier</span>
        <h2>${story.title}</h2>
        <p>${story.edition}</p>
        <div class="print-price">${story.printPrice}</div>
        <p class="print-note">Imprimé en petite série. Nous confirmons les frais de livraison et le délai avant le paiement.</p>
        <a class="order-link" href="mailto:${story.orderEmail}?subject=${subject}&body=${body}">Demander un exemplaire</a>
      </div>
    </div>
  `;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

function slideDuration(slide) {
  const wordCount = slide.text.trim().split(/\s+/).length;
  return Math.max(7500, Math.min(16000, 3600 + wordCount * 420));
}

function narrationSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function preferredVoice() {
  if (!narrationSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const knownNaturalVoices = ["amélie", "amelie", "audrey", "thomas", "denise", "henri", "marie", "google français", "google francais"];
  const score = (voice) => {
    const name = voice.name.toLocaleLowerCase("fr");
    const language = voice.lang.toLocaleLowerCase("fr");
    let value = 0;
    if (language === "fr-ca") value += 45;
    else if (language.startsWith("fr")) value += 35;
    if (/enhanced|premium|natural|neural/.test(name)) value += 100;
    const knownIndex = knownNaturalVoices.findIndex((candidate) => name.includes(candidate));
    if (knownIndex >= 0) value += 80 - knownIndex;
    if (/google|microsoft/.test(name)) value += 24;
    if (voice.default) value += 8;
    return value;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
}

function narrationSegments(text) {
  return text.match(/[^.!?…]+[.!?…]?/g)?.map((segment) => segment.trim()).filter(Boolean) || [text];
}

function cancelNarration() {
  if (!narrationSupported()) return;
  narrationRunId += 1;
  if (narrationTimer) clearTimeout(narrationTimer);
  narrationTimer = null;
  currentUtterance = null;
  window.speechSynthesis.cancel();
}

function speakCurrentSlide() {
  if (!state.narrationEnabled || state.route !== "reader" || !narrationSupported()) return;
  cancelNarration();
  const runId = narrationRunId;
  const segments = narrationSegments(currentSlide().text);
  const voice = preferredVoice();

  const speakSegment = (index) => {
    if (runId !== narrationRunId || !state.narrationEnabled || index >= segments.length) {
      currentUtterance = null;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(segments[index]);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "fr-CA";
    utterance.rate = 0.86;
    utterance.pitch = 1;
    utterance.volume = 1;
    currentUtterance = utterance;
    utterance.addEventListener("end", () => {
      if (runId !== narrationRunId) return;
      const pause = /[!?…]$/.test(segments[index]) ? 440 : 300;
      narrationTimer = setTimeout(() => speakSegment(index + 1), pause);
    });
    utterance.addEventListener("error", () => {
      if (runId === narrationRunId) currentUtterance = null;
    });
    window.speechSynthesis.speak(utterance);
  };

  speakSegment(0);
}

function toggleNarration() {
  if (!narrationSupported()) {
    showToast("La narration n'est pas disponible dans ce navigateur");
    return;
  }
  state.narrationEnabled = !state.narrationEnabled;
  if (state.narrationEnabled) speakCurrentSlide();
  else cancelNarration();
  updateReader();
  showReaderChrome({ persist: true });
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

function setLayerSlide(layer, slide) {
  const image = layer.querySelector("img");
  const source = layer.querySelector("source");
  if (slide.mobileImage) {
    if (source) source.srcset = slide.mobileImage;
    else image.insertAdjacentHTML("beforebegin", `<source media="(max-width: 759px)" srcset="${slide.mobileImage}">`);
  } else if (source) {
    source.remove();
  }
  image.src = slide.image || "";
  return image;
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
    const previewLayer = swipeStart?.previewLayerIndex !== undefined
      ? app.querySelectorAll(".scene-layer")[swipeStart.previewLayerIndex]
      : null;
    previewLayer?.classList.remove("is-swipe-preview", "is-next", "is-previous");
    art.classList.remove("is-swiping", "is-swipe-settling");
    art.style.setProperty("--swipe-offset", "0px");
    swipeStart = null;
  };

  const prepareSwipePreview = (direction) => {
    const nextIndex = state.slideIndex + direction;
    const slide = selectedStory().slides[nextIndex];
    if (!slide) return false;
    if (swipeStart.direction === direction && swipeStart.previewLayerIndex !== undefined) return true;

    const layers = app.querySelectorAll(".scene-layer");
    const previewLayerIndex = activeSceneLayer === 0 ? 1 : 0;
    const previewLayer = layers[previewLayerIndex];
    setLayerSlide(previewLayer, slide);
    previewLayer.className = `scene-layer is-swipe-preview ${direction > 0 ? "is-next" : "is-previous"}`;
    swipeStart.direction = direction;
    swipeStart.nextIndex = nextIndex;
    swipeStart.previewLayerIndex = previewLayerIndex;
    return true;
  };

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.target.closest("button, input")) return;
    swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, cancelled: false, direction: 0 };
    art.classList.add("is-swiping");
    try {
      stage.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers and older WebViews may not expose an active capture target.
    }
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
    const direction = dx < 0 ? 1 : -1;
    const hasPreview = Math.abs(dx) > 6 && prepareSwipePreview(direction);
    art.style.setProperty("--swipe-offset", `${hasPreview ? dx : dx * 0.18}px`);
  });

  const finishSwipe = (event) => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const gesture = swipeStart;
    const { dx, cancelled, direction, nextIndex, previewLayerIndex } = gesture;
    if (cancelled || Math.abs(dx) < 48) {
      resetSwipe();
      return;
    }
    if (!direction || nextIndex === undefined || previewLayerIndex === undefined) {
      resetSwipe();
      return;
    }
    suppressStageClick = true;
    swipeStart = null;
    art.classList.remove("is-swiping");
    art.classList.add("is-swipe-settling");
    art.style.setProperty("--swipe-offset", direction > 0 ? "-100%" : "100%");
    stopPlayback();
    const transitionId = ++sceneTransitionId;
    setTimeout(() => {
      if (transitionId !== sceneTransitionId) return;
      const layers = app.querySelectorAll(".scene-layer");
      layers[activeSceneLayer].className = "scene-layer";
      layers[previewLayerIndex].className = "scene-layer is-active";
      activeSceneLayer = previewLayerIndex;
      transitionDirection = direction;
      slideElapsedMs = 0;
      art.style.setProperty("--swipe-offset", "0px");
      const story = selectedStory();
      const slide = story.slides[nextIndex];
      const motion = state.motion === "story" ? slide.motion : state.motion;
      art.className = `scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}`;
      art.dataset.slide = String(nextIndex);
      setState({ slideIndex: nextIndex });
      suppressStageClick = false;
    }, 420);
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
    const image = setLayerSlide(nextLayer, slide);

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
  const narrationButton = app.querySelector("[data-action='narration']");
  narrationButton?.setAttribute("aria-pressed", String(state.narrationEnabled));
  narrationButton?.setAttribute("aria-label", state.narrationEnabled ? "Désactiver la narration" : "Activer la narration");
  narrationButton?.setAttribute("title", preferredVoice() ? `Voix: ${preferredVoice().name}` : "Narration française");
  narrationButton?.classList.toggle("is-active", state.narrationEnabled);
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
  history.pushState({}, "", window.location.pathname);
  resetViewport();
}

function openStory(id, { updateHistory = true } = {}) {
  stopPlayback();
  slideElapsedMs = 0;
  setState({ route: "reader", storyId: id, slideIndex: 0 });
  if (updateHistory) history.pushState({}, "", storyUrl(selectedStory()));
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
  if (state.narrationEnabled) setTimeout(speakCurrentSlide, 0);
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
  cancelNarration();
  showReaderChrome({ persist: true });
  app.querySelector(".reader-shell")?.classList.remove("is-playing");
  updateTimelineUI();
}

function scheduleNextSlide() {
  if (!state.isPlaying) return;
  clearTimeout(playTimer);
  playbackStartedAt = performance.now();
  const remaining = Math.max(80, slideDuration(currentSlide()) - slideElapsedMs);
  if (state.narrationEnabled) speakCurrentSlide();
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
  const upcoming = upcomingStories();
  const featured = library[library.length - 1];
  const mobileCover = featured.slides[0]?.mobileImage || featured.coverImage;
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="Kidory">
          <span class="brand-mark">Kidory</span>
        </div>
        <span class="library-label">Bibliothèque vivante</span>
        <span class="library-count">${library.length} histoires</span>
      </header>

      <section class="featured" aria-labelledby="featured-title" style="--story-accent: ${featured.accent}">
        <picture class="featured-art" aria-hidden="true">
          <source media="(max-width: 759px)" srcset="${mobileCover}">
          <img src="${featured.coverImage}" alt="" fetchpriority="high">
        </picture>
        <div class="featured-content">
          <span class="featured-eyebrow">Nouvelle histoire</span>
          <span class="featured-kicker">${featured.kicker}</span>
          <h1 class="featured-title" id="featured-title">${featured.title}</h1>
          <div class="featured-meta" aria-label="Informations">
            <span>${featured.ageRange}</span>
            <span>${featured.duration}</span>
            <span>${featured.releaseYear}</span>
          </div>
          <p class="featured-summary">${featured.summary}</p>
          <div class="featured-actions">
            <button class="primary-action" data-story-id="${featured.id}" type="button">
              <span class="action-play" aria-hidden="true"></span>
              Lire l'histoire
            </button>
            <button class="secondary-action" data-order-id="${featured.id}" type="button">
              <span class="print-icon" aria-hidden="true"></span>
              Papier
            </button>
            <button class="round-action ${hasEngagement("liked", featured.id) ? "is-active" : ""}" data-like-id="${featured.id}" type="button" aria-label="${hasEngagement("liked", featured.id) ? "Retirer des coups de cœur" : "Ajouter aux coups de cœur"}" aria-pressed="${hasEngagement("liked", featured.id)}">
              <span class="heart-icon" aria-hidden="true"></span>
            </button>
            <button class="round-action" data-share-id="${featured.id}" type="button" aria-label="Partager ${featured.title}">
              <span class="share-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <div class="hero-index" aria-hidden="true"><span>01</span><i></i><span>02</span></div>
      </section>

      <section class="library-section" aria-labelledby="library-title">
        <div class="section-heading">
          <div><span class="section-eyebrow">La collection</span><h2 id="library-title">À lire maintenant</h2></div>
          <p>Des histoires à regarder, écouter et garder.</p>
        </div>
        <div class="story-grid">
          ${library.map(renderStoryCard).join("")}
        </div>
      </section>

      <section class="library-section upcoming-section" aria-labelledby="upcoming-title">
        <div class="section-heading">
          <div><span class="section-eyebrow">En création</span><h2 id="upcoming-title">Prochainement</h2></div>
          <p>Les prochaines enquêtes prennent forme.</p>
        </div>
        <div class="upcoming-grid">
          ${upcoming.map(renderUpcomingCard).join("")}
        </div>
      </section>

      <footer class="library-footer"><span>Kidory</span><p>Histoires éducatives, numériques et imprimées.</p></footer>
    </main>
  `;

  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyId));
  });
  document.querySelectorAll("[data-like-id]").forEach((button) => {
    button.addEventListener("click", () => toggleEngagement("liked", button.dataset.likeId));
  });
  document.querySelectorAll("[data-bookmark-id]").forEach((button) => {
    button.addEventListener("click", () => toggleEngagement("bookmarked", button.dataset.bookmarkId));
  });
  document.querySelectorAll("[data-share-id]").forEach((button) => {
    button.addEventListener("click", () => shareStory(stories.find((story) => story.id === button.dataset.shareId)));
  });
  document.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => openPrintOrder(stories.find((story) => story.id === button.dataset.orderId)));
  });
}

function renderStoryCard(story) {
  const mobileCover = story.slides[0]?.mobileImage || story.coverImage;
  return `
    <article class="story-card" style="--story-accent: ${story.accent}">
      <button class="story-open" data-story-id="${story.id}" type="button" aria-label="Lire ${story.title}">
        <picture class="story-poster" aria-hidden="true">
          <img src="${mobileCover}" alt="" loading="lazy" decoding="async">
        </picture>
        <span class="card-play" aria-hidden="true"><span class="action-play"></span></span>
      </button>
      <div class="card-content">
        <div class="card-heading"><h3>${story.title}</h3><span>${story.duration}</span></div>
        <p>${story.kicker}</p>
        <div class="card-meta"><span>${story.ageRange}</span><span>${story.topic}</span></div>
        <div class="card-actions">
          <button class="card-action ${hasEngagement("liked", story.id) ? "is-active" : ""}" data-like-id="${story.id}" type="button" aria-label="${hasEngagement("liked", story.id) ? "Retirer des coups de cœur" : "Ajouter aux coups de cœur"}" aria-pressed="${hasEngagement("liked", story.id)}"><span class="heart-icon" aria-hidden="true"></span></button>
          <button class="card-action ${hasEngagement("bookmarked", story.id) ? "is-active" : ""}" data-bookmark-id="${story.id}" type="button" aria-label="${hasEngagement("bookmarked", story.id) ? "Retirer des histoires gardées" : "Garder pour plus tard"}" aria-pressed="${hasEngagement("bookmarked", story.id)}"><span class="bookmark-icon" aria-hidden="true"></span></button>
          <button class="card-action" data-share-id="${story.id}" type="button" aria-label="Partager"><span class="share-icon" aria-hidden="true"></span></button>
          <button class="card-order" data-order-id="${story.id}" type="button"><span class="print-icon" aria-hidden="true"></span>${story.printPrice}</button>
        </div>
      </div>
    </article>
  `;
}

function renderUpcomingCard(story, index) {
  const collectionNumber = String(availableStories().length + index + 1).padStart(2, "0");
  return `
    <article class="upcoming-card tone-${story.coverTone}">
      <div class="upcoming-visual" aria-hidden="true">
        <span class="upcoming-number">${collectionNumber}</span>
        <span class="upcoming-mark"></span>
      </div>
      <div class="upcoming-copy">
        <span>${story.release}</span>
        <h3>${story.title}</h3>
        <p>${story.summary}</p>
        <div>${story.ageRange} · ${story.topic}</div>
      </div>
    </article>
  `;
}

function renderReader() {
  const story = selectedStory();
  const slide = currentSlide();
  const motion = state.motion === "story" ? slide.motion : state.motion;
  const progress = timelineValue();
  const narrationVoice = preferredVoice();

  app.innerHTML = `
    <main class="reader-shell ${state.isPlaying ? "is-playing" : ""} ${state.chromeVisible ? "chrome-visible" : ""}">
      <header class="reader-topbar">
        <button class="icon-button library-button" type="button" data-action="gallery" aria-label="Retour à la bibliothèque">
          <span class="back-icon" aria-hidden="true"></span>
        </button>
        <div class="reader-title">
          <strong>${story.title}</strong>
        </div>
        <div class="reader-actions">
          <button class="icon-button" type="button" data-action="reader-share" aria-label="Partager cette histoire"><span class="share-icon" aria-hidden="true"></span></button>
          <button class="icon-button fullscreen-button" type="button" data-action="fullscreen" aria-label="Plein écran" aria-pressed="false">
            <span class="fullscreen-icon" aria-hidden="true"></span>
          </button>
        </div>
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
        <div class="control-island">
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
          <button class="island-button narration-toggle ${state.narrationEnabled ? "is-active" : ""}" type="button" data-action="narration" aria-label="${state.narrationEnabled ? "Désactiver la narration" : "Activer la narration"}" aria-pressed="${state.narrationEnabled}" title="${narrationVoice ? `Voix: ${narrationVoice.name}` : "Narration française"}" ${narrationSupported() ? "" : "disabled"}>
            <span class="voice-icon" aria-hidden="true"></span>
          </button>
          <button class="island-button island-expanded text-toggle" type="button" data-action="toggle-text" aria-label="Afficher ou masquer le texte" aria-pressed="${state.textVisible}">
            <span aria-hidden="true">Aa</span>
          </button>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);
  document.querySelector("[data-action='reader-share']").addEventListener("click", () => shareStory(story));
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
  document.querySelector("[data-action='narration']").addEventListener("click", toggleNarration);
  document.querySelector("[data-action='toggle-text']").addEventListener("click", () => {
    state.textVisible = !state.textVisible;
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
    cancelNarration();
  } else {
    scheduleNextSlide();
  }
});

window.addEventListener("popstate", () => {
  const requestedId = new URLSearchParams(window.location.search).get("story");
  const story = availableStories().find((item) => item.id === requestedId);
  if (story) openStory(story.id, { updateHistory: false });
  else {
    stopPlayback();
    slideElapsedMs = 0;
    setState({ route: "gallery", slideIndex: 0 });
  }
});

const requestedStoryId = new URLSearchParams(window.location.search).get("story");
if (availableStories().some((story) => story.id === requestedStoryId)) {
  state.route = "reader";
  state.storyId = requestedStoryId;
}

render();
