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
          <span class="brand-mark">Kidory</span>
          <span class="brand-sub">Histoires illustrées</span>
        </div>
        <button class="round-tool" type="button" aria-label="Shuffle stories">⌘</button>
      </header>

      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">Bibliothèque jeunesse</p>
          <h1>Lire, écouter, imaginer.</h1>
          <p>Des histoires éducatives courtes avec images, mouvement doux et lecture interactive.</p>
        </div>

        <button class="featured cover-${featured.coverTone}" data-story-id="${featured.id}" type="button">
          <span class="featured-art" aria-hidden="true"></span>
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
        <span>${stories.length} livres</span>
      </section>

      <section class="story-rail" aria-label="Story gallery">
        ${stories.map(renderStoryCard).join("")}
      </section>

      <section class="people-strip" aria-label="Personnages">
        <h2>Personnages</h2>
        <div class="people-row">
          ${renderPerson("Octavio", "O", "boy")}
          ${renderPerson("Maman", "M", "mom")}
          ${renderPerson("Babaou", "B", "monkey")}
          ${renderPerson("Dino", "D", "dino")}
        </div>
      </section>

      <nav class="bottom-nav" aria-label="Navigation">
        <a href="#" aria-current="page"><span>⌂</span>Accueil</a>
        <a href="#"><span>⌕</span>Explorer</a>
        <a href="#"><span>▱</span>Sauvegardés</a>
        <a href="#"><span>◌</span>Profil</a>
      </nav>
    </main>
  `;

  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyId));
  });
}

function renderPerson(name, initial, tone) {
  return `
    <span class="person">
      <span class="avatar avatar-${tone}">${initial}</span>
      <span>${name}</span>
    </span>
  `;
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
        <div class="mode-toggle" aria-label="Reading mode">
          <span>Audio</span>
          <strong>Text</strong>
        </div>
        <button class="circle-button" type="button" aria-label="Reader settings">⌾</button>
      </header>

      <section class="reader-heading">
        <div class="reader-meta">
          <span>${story.topic}</span>
          <strong>${story.title}</strong>
        </div>
      </section>

      <section class="stage" aria-live="polite">
        <div class="scene-art cover-${story.coverTone} motion-${motion}${slide.image ? " has-image" : ""}" data-slide="${state.slideIndex}"${imageStyle}>
          <div class="scene-copy">
            <p>${slide.text}</p>
            <span class="scene-label">${slide.imageLabel}</span>
          </div>
        </div>
      </section>

      <section class="reader-controls" aria-label="Story controls">
        <div class="transport minimal">
          <button class="play-button" type="button" data-action="play">${state.isPlaying ? "Pause" : "Play"}</button>
          <input data-action="scrub" type="range" min="0" max="${story.slides.length - 1}" value="${state.slideIndex}" aria-label="Story slide" style="--progress: ${progress}%" />
          <span class="slide-count">${state.slideIndex + 1}/${story.slides.length}</span>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='gallery']").addEventListener("click", goToGallery);
  document.querySelector("[data-action='play']").addEventListener("click", togglePlayback);
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
