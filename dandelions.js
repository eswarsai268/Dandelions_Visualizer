const audio = document.getElementById("audio");
const img = document.getElementById("image");
const leftBars = document.querySelectorAll(".left .bar");
const rightBars = document.querySelectorAll(".right .bar");
const lyricsDisplay = document.getElementById("lyrics-display");
const seedAnimations = new Set();
let endingFadeTimeout = null;
const ENDING_FADE_DURATION = 1400;
function clearSeedAnimationsAndLayer() {
    seedAnimations.forEach(animation => {
        animation.cancel();
    });
    seedAnimations.clear();
    // Keep the layer itself: the ambient seed interval reuses it on replay.
    document.querySelector(".seed-animation-layer")?.replaceChildren();

}

function fadeOutFinishedVisuals() {
    document.body.classList.add("playback-ended");
    if (endingFadeTimeout !== null) {
        window.clearTimeout(endingFadeTimeout);
    }
    endingFadeTimeout = window.setTimeout(() => {
        clearSeedAnimationsAndLayer();
        endingFadeTimeout = null;
    }, ENDING_FADE_DURATION);
}

function resetFinishedVisuals() {
    const wasFadingOut = document.body.classList.contains("playback-ended");
    if (endingFadeTimeout !== null) {
        window.clearTimeout(endingFadeTimeout);
        endingFadeTimeout = null;
    }
    document.body.classList.remove("playback-ended");
    if (wasFadingOut) {
        clearSeedAnimationsAndLayer();
    }
}

// ============================================================
// 1. AUDIO VISUALIZER - REFINED SONG4 LOGIC
// ============================================================

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContextClass();
const source = audioCtx.createMediaElementSource(audio);
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);
analyser.connect(audioCtx.destination);
const timeData = new Uint8Array(analyser.fftSize);
const BASE_BAR_WIDTH = 20;

// ============================================================
// 2. ANIMATION VARIABLES
// ============================================================
let imageScale = 1;
const leftBarLevels = new Float32Array(leftBars.length);
const rightBarLevels = new Float32Array(rightBars.length);
let visualizerFrameId = null;
let previousFrameTime = 0;

// ============================================================
// 3. IMAGE SCALING - ORIGINAL SONG4 APPROACH
// ============================================================
function animateImage(deltaTime) {
    let sum = 0;
    // Average waveform amplitude.
    for (let i = 0; i < timeData.length; i++) {
        sum += Math.abs(timeData[i] - 128);
    }
    const averageAmplitude = sum / timeData.length;
    const targetScale = 1 + averageAmplitude / 250;
    // Smooth expansion and contraction.
    const smoothing = 1 - Math.exp(-deltaTime / 0.16);
    imageScale += (targetScale - imageScale) * smoothing;
    img.style.transform = `scale(${imageScale})`;
}

// ============================================================
// 4. BAR AMPLITUDE - SONG4 INSPIRED
// ============================================================
function getBarAmplitude(index) {
    const sampleIndex = (index * 4) % timeData.length;
    const amplitude = Math.abs(timeData[sampleIndex] - 128);
    return Math.min(amplitude * 2.5, 75);
}

// ============================================================
// 5. BAR SCALING - MEDIUM CONTRACTION
// ============================================================
function animateBars(bars, levels, deltaTime) {
    bars.forEach((bar, index) => {
        const targetWidth = getBarAmplitude(index);
        const smoothingTime = targetWidth > levels[index]? 0.06: 0.10;
        const smoothing = 1 - Math.exp(-deltaTime / smoothingTime);
        levels[index] += (targetWidth - levels[index]) * smoothing;
        const finalWidth = BASE_BAR_WIDTH + levels[index];
        bar.style.width = `${finalWidth}px`;
    });
}

// ============================================================
// 6. MAIN VISUALIZER LOOP
// ============================================================
function animateVisualizer(timestamp) {
    const deltaTime = previousFrameTime? Math.min((timestamp - previousFrameTime) / 1000,0.05): 1 / 60;
    previousFrameTime = timestamp;
    // While playing, read actual audio.
    // While paused, feed silence so everything returns to baseline.
    if (audio.paused || audio.ended) {
        timeData.fill(128);
    } else {
        analyser.getByteTimeDomainData(timeData);
    }
    animateImage(deltaTime);
    animateBars(leftBars,leftBarLevels,deltaTime);
    animateBars(rightBars,rightBarLevels,deltaTime);
    // When paused, allow the animation to finish retracting.
    if (audio.paused || audio.ended) {
        const imageSettled = Math.abs(imageScale - 1) < 0.001;
        const barsSettled = [...leftBarLevels, ...rightBarLevels].every(level => level < 0.15);
        if (imageSettled && barsSettled) {
            imageScale = 1;
            img.style.transform = "scale(1)";
            [...leftBars, ...rightBars].forEach(bar => {
                bar.style.width = `${BASE_BAR_WIDTH}px`;
            });
            visualizerFrameId = null;
            previousFrameTime = 0;
            return;
        }
    }
    visualizerFrameId = requestAnimationFrame(animateVisualizer);
}

// ============================================================
// 7. START VISUALIZER ON PLAY
// ============================================================
function startVisualizer() {
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(console.error);
    }
    if (visualizerFrameId === null) {
        visualizerFrameId = requestAnimationFrame(animateVisualizer);
    }
}

// Also make sure the visualizer retracts if necessary.
function settleVisualizer() {
    if (visualizerFrameId === null) {
        visualizerFrameId = requestAnimationFrame(animateVisualizer);
    }
}
audio.addEventListener("play", startVisualizer);
audio.addEventListener("pause", settleVisualizer);
audio.addEventListener("ended", settleVisualizer);

// ============================================================
// 2. WORD-BY-WORD LYRICS
// ============================================================
const liricle = new Liricle();
let lyricLines = [];
let currentLine = null;
let lyricsFrameId = null;
// Generate a unique identity for each original lyric line.
function getLineKey(line) {
    return `${line.time}|${line.text || ""}`;
}

// ============================================================
// 3. FIND THE COMPLETE LYRIC LINE
// ============================================================
function findFullLyricLine(syncLine) {
    if (!syncLine || !lyricLines.length) {
        return null;
    }
    const syncTime = Number(syncLine.time);
    let matchingLine = lyricLines.find(line => {
        return Math.abs(Number(line.time) - syncTime) < 0.05;
    });
    if (!matchingLine && syncLine.text) {
        matchingLine = lyricLines.find(line => {
            return line.text === syncLine.text;
        });
    }
    if (!matchingLine) {
        console.warn(
            "Could not find the original word-timed lyric line:",
            syncLine
        );
        return null;
    }
    return matchingLine;
}

// ============================================================
// 4. RENDER THE LYRIC WORDS
// ============================================================
function renderLine(line) {
    lyricsDisplay.replaceChildren();
    lyricsDisplay.classList.remove("mine-spotlight-active");
    const words = Array.isArray(line.words)? line.words: [];
    if (words.length > 0) {
        words.forEach(word => {
            const wordSpan = document.createElement("span");
            wordSpan.className = "lyric-word";
            const cleanWord = String(word.text || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            const isMineWord = cleanWord === "mine";
            const isLoveWord = cleanWord === "love";
            const isSmileWord = cleanWord === "smile";
            const isGodWord = cleanWord === "god";
            const isDandelionsWord = ["dandelion", "dandelions"].includes(cleanWord);
            const isNameOrGame = ["name", "game"].includes(cleanWord);
            // Existing highlights.
            if (isNameOrGame || isMineWord) {
                wordSpan.classList.add("lyric-highlight");
            }
            if (isMineWord) {
                wordSpan.classList.add("lyric-mine");
            }
            if (isLoveWord) {
                wordSpan.classList.add("lyric-love");
            }
            if (isGodWord) {
                wordSpan.classList.add("lyric-god");
            }
            // SMILE uses the same highlight and spotlight system as MINE.
            if (isSmileWord) {
                wordSpan.classList.add("lyric-smile","lyric-highlight");
            }
            if (isDandelionsWord) {
                wordSpan.classList.add("lyric-dandelions");
            }
            wordSpan.dataset.time = String(Number(word.time));
            // Capitalise special words.
            const displayText =
                (isMineWord || isDandelionsWord || isSmileWord)
                    ? cleanWord.toUpperCase()
                    : String(word.text || "").trim();
            // Create individual letter elements.
            const letters = Array.from(displayText);
            letters.forEach((character, index) => {
                const letterSpan = document.createElement("span");
                letterSpan.className = "lyric-letter";
                letterSpan.textContent = character;
                if (isDandelionsWord) {
                    letterSpan.classList.add("lyric-dandelion-letter");
                    letterSpan.classList.add(
                        index % 2 === 0? "from-below": "from-above"
                    );
                    letterSpan.style.animationDelay = "0s";
                } else {
                    letterSpan.style.animationDelay =
                        `${index * 0.04}s`;
                }
                wordSpan.appendChild(letterSpan);
            });
            // Attach smile.png AFTER creating the letters.
            if (isSmileWord) {
                const finalLetter = wordSpan.lastElementChild;
                finalLetter.classList.add("smile-final-letter");
                const smileImage = document.createElement("img");
                smileImage.src = "assets/smile.png";
                smileImage.className = "smile-face-attachment";
                smileImage.alt = "";
                smileImage.draggable = false;
                smileImage.setAttribute("aria-hidden", "true");
                finalLetter.appendChild(smileImage);
            }
            lyricsDisplay.appendChild(wordSpan);
        });
        return;
    }
    // Fallback for lines without word-level timestamps.
    lyricsDisplay.textContent = line.text || "";
    console.warn(
        "This lyric line has no word-level timestamps:",
        line
    );
}

// =========================================
// GENERATE SPARKLE PARTICLES
// =========================================
function spawnSparkles(wordElement) {
    const particleCount = 32;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("span");
        particle.className = "lyric-sparkle";
        // Distribute particles evenly around all four edges.
        const edge = i % 4;
        let left;
        let top;
        let x;
        let y;
        const randomOffset = () =>
            (Math.random() - 0.5) * 30;
        const distance = 18 + Math.random() * 28;
        // TOP EDGE
        if (edge === 0) {
            left = Math.random() * 100;
            top = -5;
            x = randomOffset();
            y = -distance;
        }
        // BOTTOM EDGE
        else if (edge === 1) {
            left = Math.random() * 100;
            top = 105;
            x = randomOffset();
            y = distance;
        }
        // LEFT EDGE
        else if (edge === 2) {
            left = -5;
            top = Math.random() * 100;
            x = -distance;
            y = randomOffset();
        }
        // RIGHT EDGE
        else {
            left = 105;
            top = Math.random() * 100;
            x = distance;
            y = randomOffset();
        }
        particle.style.setProperty("--sparkle-left",`${left}%`);
        particle.style.setProperty("--sparkle-top",`${top}%`);
        particle.style.setProperty("--sparkle-x",`${x}px`);
        particle.style.setProperty("--sparkle-y",`${y}px`);
        particle.style.setProperty("--sparkle-size",`${3 + Math.random() * 4}px`);
        particle.style.setProperty("--sparkle-delay",`${Math.random() * 180}ms`);
        wordElement.appendChild(particle);
        // Remove particle after animation.
        particle.addEventListener("animationend",() => 
            particle.remove(),{ once: true }
        );
    }
}

// ============================================================
// SEED ANIMATION TRACKING AND PLAYBACK CONTROL
// ============================================================
function trackSeedAnimation(animation, seed) {
    // Register this animation.
    seedAnimations.add(animation);
    // If audio is already paused or the tab is hidden, freeze the newly created animation immediately.
    if (audio.paused || document.hidden) {
        animation.pause();
    }
    // Remove the seed after its animation finishes.
    animation.addEventListener("finish", () => {
        seedAnimations.delete(animation);
        seed.remove();
    }, { once: true });
    // Remove cancelled animations from the tracker.
    animation.addEventListener("cancel", () => {
        seedAnimations.delete(animation);
    }, { once: true });
}

// Pause every tracked seed.
function pauseSeedAnimations() {
    seedAnimations.forEach(animation => {
        if (
            animation.playState !== "paused" &&
            animation.playState !== "finished" &&
            animation.playState !== "idle"
        ) {
            animation.pause();
        }
    });
}
// Resume every tracked seed.
function resumeSeedAnimations() {
    // Never resume while audio is paused or the tab is hidden.
    if (audio.paused || audio.ended || document.hidden) {
        return;
    }
    seedAnimations.forEach(animation => {
        if (animation.playState === "paused") {
            animation.play();
        }
    });
}

// ============================================================
// DANDELIONS WORD - FIVE FLOATING SEEDS
// ============================================================
function getSeedAnimationLayer() {
    // Reuse the layer from the existing seed animation.
    let seedLayer = document.querySelector(".seed-animation-layer");
    if (!seedLayer) {
        seedLayer = document.createElement("div");
        seedLayer.className = "seed-animation-layer";
        document.body.appendChild(seedLayer);
    }
    return seedLayer;
}

function spawnDandelionSeeds(wordElement) {
    const seedLayer = getSeedAnimationLayer();
    const wordRect = wordElement.getBoundingClientRect();
    const seedCount = 5;
    const startX = wordRect.left + wordRect.width / 2;
    const startY = wordRect.top + wordRect.height / 2;
    for (let i = 0; i < seedCount; i++) {
        const seed = document.createElement("img");
        seed.className = "lyric-dandelion-seed";
        seed.src = "assets/dandelion_seed.png";
        seed.alt = "";
        seed.draggable = false;
        seed.setAttribute("aria-hidden", "true");
        seed.style.left = `${startX}px`;
        seed.style.top = `${startY}px`;
        seed.style.width = `${24 + Math.random() * 4}px`;
        seedLayer.appendChild(seed);
        // Each seed gets a different direction AFTER originating together.
        const spreadDirection = i - 2;
        const driftX = spreadDirection * 52 + (Math.random() - 0.5) * 20;
        const sway = 20 + Math.random() * 25;
        const direction = Math.random() < 0.5 ? -1 : 1;
        // Travel beyond the top edge.
        const rise = startY + 55;
        const duration = 4800 + Math.random() * 1800;
        const keyframes = [
            // All five seeds begin at exactly the same position.
            {
                offset: 0,
                opacity: 1,
                transform: `translate(-50%, -100%) translate(0px, 0px) scale(0.55)`
            },
            // They begin separating from their common origin.
            {
                offset: 0.10,
                opacity: 1,
                transform: `translate(-50%, -100%) translate(${driftX * 0.10}px, ${-rise * 0.10}px) scale(0.8)`
            },
            // Fan out into individual floating paths.
            {
                offset: 0.38,
                opacity: 1,
                transform: `translate(-50%, -100%) translate(${driftX * 0.38 + sway * direction}px, ${-rise * 0.38}px) scale(1)`
            },
            {
                offset: 0.70,
                opacity: 1,
                transform: `translate(-50%, -100%) translate(${driftX * 0.70 - sway * direction}px, ${-rise * 0.70}px) scale(0.96)`
            },
            // Finish above the screen.
            {
                offset: 1,
                opacity: 1,
                transform: `translate(-50%, -100%) translate(${driftX}px, ${-rise}px) scale(0.9)`
            }
        ];
        const animation = seed.animate(
            keyframes,
            {
                duration,
                easing: "linear",
                fill: "forwards"
            }
        );
        // Track this seed so audio pause freezes it too.
        trackSeedAnimation(animation, seed);
    }
}

// ============================================================
// 5. WORD VISIBILITY AND ANIMATION
// ============================================================
function updateWordVisibility(currentTime) {
    const wordsOnScreen = Array.from(
        lyricsDisplay.querySelectorAll(".lyric-word")
    );
    // Find the latest reached spotlight word: MINE or SMILE.
    let spotlightWordToShow = null;
    wordsOnScreen.forEach(span => {
        const isSpotlightWord = span.classList.contains("lyric-mine") || span.classList.contains("lyric-smile");
        if (!isSpotlightWord) {
            return;
        }
        const wordStart = Number(span.dataset.time);
        if (Number.isFinite(wordStart) && currentTime >= wordStart) {
            if (!spotlightWordToShow || wordStart >= Number(spotlightWordToShow.dataset.time)) {
                spotlightWordToShow = span;
            }
        }
    });
    const mineSpotlightActive = spotlightWordToShow !== null;
    lyricsDisplay.classList.toggle("mine-spotlight-active",mineSpotlightActive);
    wordsOnScreen.forEach(span => {
        const wordStart = Number(span.dataset.time);
        const timestampReached = Number.isFinite(wordStart) && currentTime >= wordStart;
        // MINE gets the screen alone.
        const isVisible = mineSpotlightActive? span === spotlightWordToShow: timestampReached;
        span.classList.toggle("is-mine-spotlight",span === spotlightWordToShow);
        span.classList.toggle("is-visible", isVisible);
        // Five seeds whenever DANDELIONS reaches its timestamp.
        if (timestampReached && span.classList.contains("lyric-dandelions") && span.dataset.dandelionSeedsPlayed !== "true") {
            span.dataset.dandelionSeedsPlayed = "true";
            spawnDandelionSeeds(span);
        }
        // Existing sparkles for NAME, GAME and MINE.
        if (isVisible && span.classList.contains("lyric-highlight") && span.dataset.sparklesPlayed !== "true") {
            span.dataset.sparklesPlayed = "true";
            spawnSparkles(span);
        }
    });
}

// ============================================================
// 6. HANDLE LYRICLE SYNC EVENTS
// ============================================================

function handleLyricSync(syncLine) {
    if (!syncLine) {
        return;
    }
    // Get the full original line, including its word timestamps.
    // Do not render the simplified sync event directly.
    const fullLine = findFullLyricLine(syncLine);
    if (!fullLine) {
        return;
    }
    const lineKey = getLineKey(fullLine);
    // Render only when the actual lyric line changes.
    if (!currentLine || lineKey !== getLineKey(currentLine)) {
        currentLine = fullLine;
        renderLine(fullLine);
    }
    updateWordVisibility(audio.currentTime);
}

// ============================================================
// 7. LOAD LYRICS
// ============================================================
// Register listeners BEFORE loading the LRC file.
liricle.on("load", (data) => {
    if (!data.lines || data.lines.length === 0) {
        lyricsDisplay.textContent = "No lyrics found.";
        console.error("The LRC file loaded, but no lyric lines were found.");
        return;
    }
    lyricLines = data.lines;
    // Find the first line containing actual word timestamps.
    const firstLyricLine = lyricLines.find(line => {
        return (Array.isArray(line.words) && line.words.length > 0);
    }) || lyricLines[0];
    // Display the first lyric line.
    currentLine = firstLyricLine;
    renderLine(firstLyricLine);
    updateWordVisibility(audio.currentTime);
    console.info("Lyrics loaded:",lyricLines.length,"lines");
    console.info("Enhanced LRC:",data.enhanced);
    if (!data.enhanced) {
        console.warn("Word-by-word timing requires enhanced LRC timestamps.");
    }
});
// Listen for changes in the current lyric line.
liricle.on("sync", (line, word) => {
    handleLyricSync(line);
});

// Handle failed LRC loading.
liricle.on("loaderror", (error) => {
    lyricsDisplay.textContent = "Could not load lyrics.";
    console.error("Lyrics failed to load:",error);
});

// ============================================================
// 8. CONTINUOUS LYRICS SYNCHRONIZATION
// ============================================================
function syncLyricsFrame() {
    if (audio.paused || audio.ended) {
        lyricsFrameId = null;
        return;
    }
    // Synchronize Liricle with the current audio position.
    liricle.sync(audio.currentTime, false);
    checkNaturalSeedStart();
    // Update word visibility on every animation frame.
    updateWordVisibility(audio.currentTime);
    lyricsFrameId = requestAnimationFrame(syncLyricsFrame);
}

// ============================================================
// 9. START AND STOP PLAYBACK LOOPS
// ============================================================
function startPlaybackLoops() {
    resetFinishedVisuals();
    // Resume Web Audio when required.
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(error => {
            console.warn("AudioContext could not resume:",error);
        });
    }
    resumeSeedAnimations();
    // Start visualizer.
    if (visualizerFrameId === null) {
        visualizerFrameId = requestAnimationFrame(animateVisualizer);
    }
    // Synchronize lyrics immediately.
    liricle.sync(audio.currentTime, true);
    // Start natural seeds if playback resumes beyond 2:54.
    checkNaturalSeedStart();
    updateWordVisibility(audio.currentTime);
    // Start lyrics animation loop.
    if (lyricsFrameId === null) {
        lyricsFrameId = requestAnimationFrame(syncLyricsFrame);
    }
}

// ============================================================
// 10. PAUSE AND SEEK HANDLING
// ============================================================
function stopLyricsLoop() {
    pauseSeedAnimations();
    if (lyricsFrameId !== null) {
        cancelAnimationFrame(lyricsFrameId);
        lyricsFrameId = null;
    }
    updateWordVisibility(audio.currentTime);
}

// PLAY
audio.addEventListener("play",startPlaybackLoops);
// PAUSE
audio.addEventListener("pause",stopLyricsLoop);
// END
audio.addEventListener("ended",() => {
        stopLyricsLoop();
        fadeOutFinishedVisuals();
    }
);
// SEEK
audio.addEventListener("seeked", () => {
    // Update lyrics when the user moves the audio timeline.
    liricle.sync(audio.currentTime, true);
    checkNaturalSeedStart();
    updateWordVisibility(audio.currentTime);
});

// ============================================================
// 11. LOAD THE ENHANCED LRC FILE
// ============================================================
liricle.load({
    url: "assets/dandelions_enhanced.lrc"
});

// ============================================================
// 12. FLYING DANDELION SEEDS
// ============================================================
function startSeedAnimation() {
    const seedLayer = getSeedAnimationLayer();
    // Random number helper.
    function random(min, max) {
        return Math.random() * (max - min) + min;
    }
    // Generate one flying seed.
    function spawnFlyingSeed(delay = 0) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const seed = new Image();
        seed.src = "assets/dandelion_seed.png";
        seed.className = "flying-seed";
        seed.alt = "";
        seed.draggable = false;
        // Keep the seed tiny.
        const seedWidth = random(16, 24);
        seed.style.width = `${seedWidth}px`;
        // Starting position: completely outside the
        // bottom-left desktop boundary.
        const startX = random(-seedWidth - 35,-seedWidth - 12);
        const startY = random(viewportHeight + 12,viewportHeight + 55);
        // Destination: top-middle OR top-right.
        const destinationX = Math.random() < 0.45
            ? random(viewportWidth * 0.45, viewportWidth * 0.63)
            : random(viewportWidth * 0.74, viewportWidth * 0.94);
        // Destination is beyond the top edge of the screen.
        const destinationY = -45;
        const dx = destinationX - startX;
        const dy = destinationY - startY;
        // Give each seed a slightly different floating path.
        const sway = random(25, 65);
        const direction = Math.random() < 0.5 ? -1 : 1;
        seed.style.left = `${startX}px`;
        seed.style.top = `${startY}px`;
        seedLayer.appendChild(seed);
        // Build the floating journey.
        const keyframes = [
            {
                offset: 0,
                opacity: 1,
                transform:
                    `translate(0, 0) rotate(${random(-20, 20)}deg) scale(0.8)`
            },
            {
                offset: 0.12,
                opacity: 1,
                transform: `translate(${dx * 0.12}px, ${dy * 0.12}px) rotate(${random(-10, 15)}deg) scale(1)`
            },
            {
                offset: 0.34,
                opacity: 1,
                transform: `translate(${dx * 0.34 + sway * direction}px, ${dy * 0.32}px) rotate(${random(10, 25)}deg) scale(1.05)`
            },
            {
                offset: 0.57,
                opacity: 1,
                transform: `translate(${dx * 0.57 - sway * direction}px, ${dy * 0.58}px) rotate(${random(-25, -10)}deg) scale(0.95)`
            },
            {
                offset: 0.82,
                opacity: 1,
                transform: `translate(${dx * 0.82 + sway * 0.5 * direction}px, ${dy * 0.83}px) rotate(${random(5, 20)}deg) scale(0.9)`
            },
            {
                offset: 1,
                opacity: 1,
                transform: `translate(${dx}px, ${dy}px) rotate(${random(-20, 20)}deg) scale(0.8)`
            }
        ];
        // Animate the seed.
        const animation = seed.animate(
            keyframes,
            {
                duration: random(9500, 14000),
                delay: delay,
                easing: "linear",
                fill: "forwards"
            }
        );
        // Track this natural seed using the shared tracker.
        trackSeedAnimation(animation, seed);
    }
    // Initial floating seeds.
    for (let i = 0; i < NATURAL_INITIAL_SEED_COUNT; i++) {
        spawnFlyingSeed(i * 700);
    }
    // Continuously introduce new seeds.
    window.setInterval(() => {
        // Never create new seeds while paused, ended, or when the browser tab is hidden.
        if (audio.paused || audio.ended || document.hidden) {
            return;
        }
        for (let i = 0; i < NATURAL_SEEDS_PER_INTERVAL; i++) {
            spawnFlyingSeed(i * 250);
        }
    }, NATURAL_SEED_INTERVAL);
}

// =========================================
// NATURAL FLOATING SEED SETTINGS
// =========================================
const NATURAL_SEED_START_TIME = 174; // 2:54
const NATURAL_INITIAL_SEED_COUNT = 5;
const NATURAL_SEEDS_PER_INTERVAL = 5;
const NATURAL_SEED_INTERVAL = 1900;
let naturalSeedsStarted = false;
// Check whether natural seeds should begin.
function checkNaturalSeedStart() {
    // Do not start the effect while paused or hidden.
    if (
        !naturalSeedsStarted && !audio.paused &&
        !audio.ended && !document.hidden &&
        audio.currentTime >= NATURAL_SEED_START_TIME
    ) {
        naturalSeedsStarted = true;
        startSeedAnimation();
    }
}

// =========================================
// PAUSE / RESUME SEEDS ON TAB SWITCH
// =========================================
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        // Freeze every seed when leaving the tab.
        pauseSeedAnimations();
    } else {
        // Resume seeds only if audio is playing.
        resumeSeedAnimations();
    }
});