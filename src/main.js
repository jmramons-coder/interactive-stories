import { stories } from "./stories.js";

const state = {
  route: "gallery",
  storyId: stories[0].id,
  slideIndex: 0,
  isPlaying: false,
  soundOn: false,
  motion: "story"
};

let playTimer = null;
let audioContext = null;
let noiseNode = null;

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

function goToGallery() {
  stopPlayback();
  setState({ route: "gallery", slideIndex: 0 });
}

function openStory(id) {
  stopPlayback();
  setState({ route: "reader", storyId: id, slideIndex: 0 });
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

  state.isPlaying = true;
  playTimer = setInterval(() => {
    const story = selectedStory();
    if (state.slideIndex >= story.slides.length - 1) {
      stopPlayback();
      render();
      return;
    }
    state.slideIndex += 1;
    render();
  }, 3200);
  render();
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
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand" aria-label="Interactive Stories">
          <span class="brand-mark">Stories</span>
          <span class="brand-sub">Read like a small film</span>
        </div>
        <span class="pill">${stories.length} stories</span>
      </header>

      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">Interactive picture books</p>
          <h1>Learn through tiny cinematic worlds.</h1>
          <p>Simple stories, calm motion, large readable text, and print-ready imagery when your real book art is ready.</p>
        </div>

        <button class="featured cover-${featured.coverTone}" data-story-id="${featured.id}" type="button">
          <span class="featured-content">
            <span class="meta-row">
              <span class="mini-chip">${featured.ageRange}</span>
              <span class="mini-chip">${featured.duration}</span>
            </span>
            <span class="featured-title">${featured.title}</span>
            <span class="featured-summary">${featured.summary}</span>
            <span class="primary-action">Start story</span>
          </span>
        </button>
      </section>

      <section class="rail-header">
        <h2>Library</h2>
        <span>Swipe to browse</span>
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
  return `
    <button class="story-card" data-story-id="${story.id}" type="button">
      <span class="story-poster cover-${story.coverTone}" aria-hidden="true"></span>
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
  const imageStyle = slide.image ? ` style="--slide-image: url('${slide.image}')"` : "";

  app.innerHTML = `
    <main class="reader-shell">
      <header class="reader-topbar">
        <button class="circle-button" type="button" data-action="gallery" aria-label="Back to gallery">‹</button>
        <div class="reader-meta">
          <span>${story.topic}</span>
          <strong>${story.title}</strong>
        </div>
        <button class="circle-button" type="button" data-action="sound" aria-label="${state.soundOn ? "Turn sound off" : "Turn sound on"}" aria-pressed="${state.soundOn}">
          ${state.soundOn ? "♪" : "○"}
        </button>
      </header>

      <section class="stage" aria-live="polite">
        <div class="scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}" data-slide="${state.slideIndex}"${imageStyle}>
          <div class="scene-copy">
            <p>${slide.text}</p>
            <span class="scene-label">${slide.imageLabel}</span>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="transport">
          <button class="circle-button" type="button" data-action="prev" aria-label="Previous slide" ${state.slideIndex === 0 ? "disabled" : ""}>‹</button>
          <button class="play-button" type="button" data-action="play">${state.isPlaying ? "Pause" : "Play"}</button>
          <button class="circle-button" type="button" data-action="next" aria-label="Next slide" ${state.slideIndex === story.slides.length - 1 ? "disabled" : ""}>›</button>
        </div>

        <div class="timeline">
          <span>${state.slideIndex + 1}</span>
          <input data-action="scrub" type="range" min="0" max="${story.slides.length - 1}" value="${state.slideIndex}" aria-label="Story slide" style="--progress: ${progress}%" />
          <span>${story.slides.length}</span>
        </div>

        <div class="reader-options">
          <select data-action="motion" aria-label="Motion style">
            <option value="story" ${state.motion === "story" ? "selected" : ""}>Auto motion</option>
            <option value="pan-left" ${state.motion === "pan-left" ? "selected" : ""}>Drift left</option>
            <option value="pan-right" ${state.motion === "pan-right" ? "selected" : ""}>Drift right</option>
            <option value="zoom-in" ${state.motion === "zoom-in" ? "selected" : ""}>Slow zoom in</option>
            <option value="zoom-out" ${state.motion === "zoom-out" ? "selected" : ""}>Slow zoom out</option>
          </select>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='sound']").addEventListener("click", toggleSound);
  document.querySelector("[data-action='prev']").addEventListener("click", () => moveSlide(-1));
  document.querySelector("[data-action='next']").addEventListener("click", () => moveSlide(1));
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
  document.querySelector("[data-action='motion']").addEventListener("change", (event) => setState({ motion: event.target.value }));
  document.querySelector("[data-action='scrub']").addEventListener("input", (event) => {
    stopPlayback();
    setState({ slideIndex: Number(event.target.value) });
  });
}

function render() {
  if (state.route === "gallery") {
    renderGallery();
  } else {
    renderReader();
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

render();
