import { stories } from "./stories.js";

const state = {
  route: "gallery",
  storyId: stories[0].id,
  slideIndex: 0,
  isPlaying: false,
  soundOn: false,
  motion: "story",
  textVisible: true
};

let playTimer = null;
let audioContext = null;
let noiseNode = null;
let activeSceneLayer = 0;
let sceneTransitionId = 0;
let scrubTimer = null;

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
  copy.querySelector(".scene-label").textContent = slide.imageLabel;
  if (slideChanged) {
    copy.classList.remove("is-entering");
    requestAnimationFrame(() => copy.classList.add("is-entering"));
  }

  shell.classList.toggle("is-playing", state.isPlaying);
  const playButton = app.querySelector("[data-action='play']");
  playButton.classList.toggle("is-playing", state.isPlaying);
  playButton.setAttribute("aria-pressed", String(state.isPlaying));
  playButton.setAttribute("aria-label", state.isPlaying ? "Pause story" : "Play story");
  playButton.querySelector(".play-text").textContent = state.isPlaying ? "Pause" : "Play";
  const textButton = app.querySelector("[data-action='toggle-text']");
  textButton.setAttribute("aria-pressed", String(state.textVisible));
  textButton.setAttribute("aria-label", state.textVisible ? "Hide story text" : "Show story text");
  const scrubber = app.querySelector("[data-action='scrub']");
  scrubber.value = String(state.slideIndex);
  scrubber.style.setProperty("--progress", `${story.slides.length === 1 ? 100 : (state.slideIndex / (story.slides.length - 1)) * 100}%`);
  app.querySelector(".slide-count").textContent = `${state.slideIndex + 1}/${story.slides.length}`;
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
    clearInterval(playTimer);
    playTimer = null;
  }
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
  playTimer = setInterval(() => {
    const activeStory = selectedStory();
    if (state.slideIndex >= activeStory.slides.length - 1) {
      stopPlayback();
      render();
      return;
    }
    setState({ slideIndex: state.slideIndex + 1 });
  }, 5600);
  render();
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
  button.setAttribute("aria-label", isFullscreen ? "Exit full screen" : "Enter full screen");
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

function toggleSound() {
  state.soundOn = !state.soundOn;
  if (state.soundOn) {
    startAmbientNoise();
  } else {
    stopAmbientNoise();
  }
  render();
}

function startAmbientNoise() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (audioContext || !AudioContextClass) {
    return;
  }

  audioContext = new AudioContextClass();
  const bufferSize = 2 * audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < bufferSize; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * 0.035;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = buffer;
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 620;
  gain.gain.value = 0.08;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start();
  noiseNode = source;
}

function stopAmbientNoise() {
  if (noiseNode) {
    noiseNode.stop();
  }
  noiseNode = null;
  if (audioContext) {
    audioContext.close();
  }
  audioContext = null;
}

function renderGallery() {
  const featured = stories[0];
  const featuredCoverStyle = featured.coverImage ? ` style="background-image: url('${featured.coverImage}')"` : "";
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="Interactive Stories">
          <span class="brand-mark">Kidory</span>
          <span class="brand-sub">Histoires illustrées</span>
        </div>
      </header>

      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">Bibliothèque jeunesse</p>
          <h1>Lire, écouter, imaginer.</h1>
          <p>Des histoires éducatives courtes avec images, mouvement doux et lecture interactive.</p>
        </div>

        <button class="featured cover-${featured.coverTone}${featured.coverImage ? " has-cover" : ""}" data-story-id="${featured.id}" type="button">
          <span class="featured-art" aria-hidden="true"${featuredCoverStyle}></span>
          <span class="featured-content">
            <span class="meta-row">
              <span class="mini-chip">${featured.ageRange}</span>
              <span class="mini-chip">${featured.duration}</span>
            </span>
            <span class="featured-title">${featured.title}</span>
            <span class="featured-summary">${featured.summary}</span>
            <span class="primary-action">Commencer</span>
          </span>
        </button>
      </section>

      <section class="rail-header">
        <h2>Recommandations</h2>
      </section>

      <section class="story-rail" aria-label="Story gallery">
        ${stories.map(renderStoryCard).join("")}
      </section>
    </main>
  `;

  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyId));
  });
}

function renderStoryCard(story) {
  const coverStyle = story.coverImage ? ` style="background-image: url('${story.coverImage}')"` : "";
  return `
    <button class="story-card ${story.coverImage ? "has-cover" : ""}" data-story-id="${story.id}" type="button">
      <span class="story-poster cover-${story.coverTone}" aria-hidden="true"${coverStyle}></span>
      <span class="card-content">
        <span class="meta-row">
          <span class="mini-chip">${story.ageRange}</span>
          <span class="mini-chip">${story.duration}</span>
        </span>
        <span class="card-title">${story.title}</span>
        <span class="card-summary">${story.summary}</span>
      </span>
    </button>
  `;
}

function renderReader() {
  const story = selectedStory();
  const slide = currentSlide();
  const motion = state.motion === "story" ? slide.motion : state.motion;
  const progress = story.slides.length === 1 ? 100 : (state.slideIndex / (story.slides.length - 1)) * 100;
  const playLabel = state.isPlaying ? "Pause story" : "Play story";

  app.innerHTML = `
    <main class="reader-shell ${state.isPlaying ? "is-playing" : ""}">
      <header class="reader-topbar">
        <button class="library-button" type="button" data-action="gallery" aria-label="Back to library">‹ Library</button>
        <div class="reader-title">
          <span>${story.topic}</span>
          <strong>${story.title}</strong>
        </div>
        <button class="fullscreen-button" type="button" data-action="fullscreen" aria-label="Enter full screen" aria-pressed="false">
          <span class="fullscreen-icon" aria-hidden="true"></span>
        </button>
      </header>

      <section class="stage" aria-live="polite">
        <div class="scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}" data-slide="${state.slideIndex}">
          <picture class="scene-layer is-active" aria-hidden="true">${slideImageMarkup(slide)}</picture>
          <picture class="scene-layer" aria-hidden="true"><img alt="" decoding="async"></picture>
          <div class="scene-copy ${state.textVisible ? "" : "is-hidden"}">
            <p>${slide.text}</p>
            <span class="scene-label">${slide.imageLabel}</span>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="transport minimal">
          <button class="play-button ${state.isPlaying ? "is-playing" : ""}" type="button" data-action="play" aria-label="${playLabel}" aria-pressed="${state.isPlaying}">
            <span class="play-icon" aria-hidden="true"></span>
            <span class="play-text">${state.isPlaying ? "Pause" : "Play"}</span>
          </button>
          <button class="text-toggle" type="button" data-action="toggle-text" aria-pressed="${state.textVisible}" aria-label="${state.textVisible ? "Hide story text" : "Show story text"}">Aa</button>
          <input data-action="scrub" type="range" min="0" max="${story.slides.length - 1}" value="${state.slideIndex}" aria-label="Story slide" style="--progress: ${progress}%" />
          <span class="slide-count">${state.slideIndex + 1}/${story.slides.length}</span>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='fullscreen']").addEventListener("click", toggleFullscreen);
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
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
    moveSlide(-1);
  }

  if (event.key === "ArrowRight") {
    moveSlide(1);
  }

  if (event.key === " ") {
    event.preventDefault();
    togglePlayback();
  }
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

render();
