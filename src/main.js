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
  app.innerHTML = `
    <main class="shell">
      <section class="intro">
        <div>
          <p class="eyebrow">Interactive picture-book library</p>
          <h1>Educational stories built for reading, listening, and visual play.</h1>
        </div>
        <p class="intro-copy">Choose a story to preview the reader experience. Each story is already structured around print-book images, animated slide movement, narration text, a playback timeline, and optional ambient sound.</p>
      </section>

      <section class="story-grid" aria-label="Story gallery">
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
      <span class="cover cover-${story.coverTone}" aria-hidden="true">
        <span class="cover-shape"></span>
        <span class="cover-title">${story.title}</span>
      </span>
      <span class="card-body">
        <span class="meta-row">
          <span>${story.ageRange}</span>
          <span>${story.duration}</span>
        </span>
        <span class="card-title">${story.title}</span>
        <span class="card-summary">${story.summary}</span>
        <span class="topic">${story.topic}</span>
      </span>
    </button>
  `;
}

function renderReader() {
  const story = selectedStory();
  const slide = currentSlide();
  const motion = state.motion === "story" ? slide.motion : state.motion;
  const progress = story.slides.length === 1 ? 100 : (state.slideIndex / (story.slides.length - 1)) * 100;

  app.innerHTML = `
    <main class="reader-shell">
      <header class="reader-topbar">
        <button class="icon-button wide" type="button" data-action="gallery">Gallery</button>
        <div class="reader-title">
          <span>${story.topic}</span>
          <h1>${story.title}</h1>
        </div>
        <button class="icon-button" type="button" data-action="sound" aria-pressed="${state.soundOn}">
          ${state.soundOn ? "Sound on" : "Sound off"}
        </button>
      </header>

      <section class="stage" aria-live="polite">
        <div class="page-image cover-${story.coverTone} motion-${motion}" data-slide="${state.slideIndex}">
          <div class="page-text">${slide.text}</div>
          <div class="placeholder-scene">
            <span>${slide.imageLabel}</span>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="control-row">
          <button class="icon-button" type="button" data-action="prev" ${state.slideIndex === 0 ? "disabled" : ""}>Prev</button>
          <button class="play-button" type="button" data-action="play">${state.isPlaying ? "Pause" : "Play"}</button>
          <button class="icon-button" type="button" data-action="next" ${state.slideIndex === story.slides.length - 1 ? "disabled" : ""}>Next</button>
          <label class="motion-select">
            Motion
            <select data-action="motion">
              <option value="story" ${state.motion === "story" ? "selected" : ""}>By slide</option>
              <option value="pan-left" ${state.motion === "pan-left" ? "selected" : ""}>Slide left</option>
              <option value="pan-right" ${state.motion === "pan-right" ? "selected" : ""}>Slide right</option>
              <option value="zoom-in" ${state.motion === "zoom-in" ? "selected" : ""}>Zoom in</option>
              <option value="zoom-out" ${state.motion === "zoom-out" ? "selected" : ""}>Zoom out</option>
            </select>
          </label>
        </div>

        <div class="timeline">
          <span>${state.slideIndex + 1}</span>
          <input data-action="scrub" type="range" min="0" max="${story.slides.length - 1}" value="${state.slideIndex}" aria-label="Story slide" style="--progress: ${progress}%" />
          <span>${story.slides.length}</span>
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
