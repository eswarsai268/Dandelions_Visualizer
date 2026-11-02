const audio = document.getElementById("audio");
const img = document.getElementById("image");

const leftBars = document.querySelectorAll(".left .bar");
const rightBars = document.querySelectorAll(".right .bar");

const lyricsDisplay = document.getElementById("lyrics-display");


// ============================================================
// 1. AUDIO VISUALIZER - REFINED SONG4 LOGIC
// ============================================================

const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

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

const leftBarLevels =
    new Float32Array(leftBars.length);

const rightBarLevels =
    new Float32Array(rightBars.length);

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

    const averageAmplitude =
        sum / timeData.length;


    // Original SONG4 formula, without the restrictive scale cap.

    const targetScale =
        1 + averageAmplitude / 250;


    // Smooth expansion and contraction.

    const smoothing =
        1 - Math.exp(-deltaTime / 0.16);

    imageScale +=
        (targetScale - imageScale) * smoothing;


    img.style.transform =
        `scale(${imageScale})`;

}


// ============================================================
// 4. BAR AMPLITUDE - SONG4 INSPIRED
// ============================================================

function getBarAmplitude(index) {

    // Original SONG4 sample selection.

    const sampleIndex =
        (index * 4) % timeData.length;

    const amplitude =
        Math.abs(timeData[sampleIndex] - 128);

    return Math.min(amplitude * 2.5, 75);

}


// ============================================================
// 5. BAR SCALING - MEDIUM CONTRACTION
// ============================================================

function animateBars(bars, levels, deltaTime) {

    bars.forEach((bar, index) => {

        const targetWidth =
            getBarAmplitude(index);


        // Quick expansion and faster contraction.

        const smoothingTime =
            targetWidth > levels[index]
                ? 0.06   // Attack
                : 0.10;  // Release


        const smoothing =
            1 - Math.exp(-deltaTime / smoothingTime);


        levels[index] +=
            (targetWidth - levels[index]) * smoothing;


        const finalWidth =
            BASE_BAR_WIDTH + levels[index];


        bar.style.width =
            `${finalWidth}px`;

    });

}


// ============================================================
// 6. MAIN VISUALIZER LOOP
// ============================================================

function animateVisualizer(timestamp) {

    const deltaTime = previousFrameTime
        ? Math.min(
            (timestamp - previousFrameTime) / 1000,
            0.05
        )
        : 1 / 60;

    previousFrameTime = timestamp;


    // IMPORTANT:
    // While playing, read actual audio.
    // While paused, feed silence so everything returns to baseline.

    if (audio.paused || audio.ended) {

        timeData.fill(128);

    } else {

        analyser.getByteTimeDomainData(timeData);

    }


    // Update image.

    animateImage(deltaTime);


    // Update both bar groups.

    animateBars(
        leftBars,
        leftBarLevels,
        deltaTime
    );

    animateBars(
        rightBars,
        rightBarLevels,
        deltaTime
    );


    // When paused, allow the animation to finish retracting.

    if (audio.paused || audio.ended) {

        const imageSettled =
            Math.abs(imageScale - 1) < 0.001;

        const barsSettled =
            [...leftBarLevels, ...rightBarLevels]
                .every(level => level < 0.15);


        if (imageSettled && barsSettled) {

            imageScale = 1;

            img.style.transform = "scale(1)";

            [...leftBars, ...rightBars].forEach(bar => {

                bar.style.width =
                    `${BASE_BAR_WIDTH}px`;

            });

            visualizerFrameId = null;

            previousFrameTime = 0;

            return;

        }

    }


    visualizerFrameId =
        requestAnimationFrame(animateVisualizer);

}


// ============================================================
// 7. START VISUALIZER ON PLAY
// ============================================================

function startVisualizer() {

    if (audioCtx.state === "suspended") {

        audioCtx.resume().catch(console.error);

    }

    if (visualizerFrameId === null) {

        visualizerFrameId =
            requestAnimationFrame(animateVisualizer);

    }

}


// Also make sure the visualizer retracts if necessary.

function settleVisualizer() {

    if (visualizerFrameId === null) {

        visualizerFrameId =
            requestAnimationFrame(animateVisualizer);

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

    // Match the sync event with the original parsed line.
    // The sync event may not contain the words array.

    let matchingLine = lyricLines.find(line => {

        return Math.abs(
            Number(line.time) - syncTime
        ) < 0.05;

    });

    // Additional fallback using the lyric text.

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

    const words = Array.isArray(line.words)
        ? line.words
        : [];

    if (words.length > 0) {

        words.forEach(word => {

            const wordSpan = document.createElement("span");

            wordSpan.className = "lyric-word";


            // Identify words that need special styling.

            const cleanWord = String(word.text || "")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");


            // Apply the reusable highlight theme.

            const highlightedWords = ["name", "game"];

            if (highlightedWords.includes(cleanWord)) {

                wordSpan.classList.add("lyric-highlight");

            }


            wordSpan.dataset.time =
                String(Number(word.time));


            // Split the word into individual letters.

            const letters = Array.from(
                String(word.text || "").trim()
            );


            letters.forEach((character, index) => {

                const letterSpan =
                    document.createElement("span");

                letterSpan.className = "lyric-letter";

                letterSpan.textContent = character;


                // Each letter gets a slightly delayed animation.

                letterSpan.style.animationDelay =
                    `${index * 0.04}s`;


                wordSpan.appendChild(letterSpan);

            });


            lyricsDisplay.appendChild(wordSpan);

        });

        return;

    }


    // Fallback for ordinary LRC lines.

    lyricsDisplay.textContent = line.text || "";

    console.warn(
        "This lyric line has no word-level timestamps:",
        line
    );

}

// =========================================
// GENERATE REAL SPARKLE PARTICLES
// =========================================

// =========================================
// GOLDEN PARTICLES AROUND THE WHOLE WORD
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

        const distance =
            18 + Math.random() * 28;


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


        particle.style.setProperty(
            "--sparkle-left",
            `${left}%`
        );

        particle.style.setProperty(
            "--sparkle-top",
            `${top}%`
        );

        particle.style.setProperty(
            "--sparkle-x",
            `${x}px`
        );

        particle.style.setProperty(
            "--sparkle-y",
            `${y}px`
        );

        particle.style.setProperty(
            "--sparkle-size",
            `${3 + Math.random() * 4}px`
        );

        particle.style.setProperty(
            "--sparkle-delay",
            `${Math.random() * 180}ms`
        );


        wordElement.appendChild(particle);


        // Remove particle after animation.

        particle.addEventListener(
            "animationend",
            () => particle.remove(),
            { once: true }
        );

    }

}


// ============================================================
// 5. WORD VISIBILITY AND ANIMATION
// ============================================================

function updateWordVisibility(currentTime) {

    const wordsOnScreen =
        lyricsDisplay.querySelectorAll(".lyric-word");

    wordsOnScreen.forEach(span => {

        const wordStart =
            Number(span.dataset.time);

        const isVisible =
            Number.isFinite(wordStart) &&
            currentTime >= wordStart;


        // Make the word and its letters visible.

        span.classList.toggle(
            "is-visible",
            isVisible
        );


        // Trigger sparkles only once per word appearance.

        if (
            isVisible &&
            span.classList.contains("lyric-highlight") &&
            span.dataset.sparklesPlayed !== "true"
        ) {

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

    // IMPORTANT:
    // Get the full original line, including its word timestamps.
    // Do not render the simplified sync event directly.

    const fullLine =
        findFullLyricLine(syncLine);

    if (!fullLine) {
        return;
    }

    const lineKey =
        getLineKey(fullLine);

    // Render only when the actual lyric line changes.

    if (
        !currentLine ||
        lineKey !== getLineKey(currentLine)
    ) {

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

        console.error(
            "The LRC file loaded, but no lyric lines were found."
        );

        return;

    }

    // Store every complete parsed lyric line.

    lyricLines = data.lines;

    // Find the first line containing actual word timestamps.

    const firstLyricLine = lyricLines.find(line => {

        return (
            Array.isArray(line.words) &&
            line.words.length > 0
        );

    }) || lyricLines[0];

    // Display the first lyric line.

    currentLine = firstLyricLine;

    renderLine(firstLyricLine);

    updateWordVisibility(audio.currentTime);

    console.info(
        "Lyrics loaded:",
        lyricLines.length,
        "lines"
    );

    console.info(
        "Enhanced LRC:",
        data.enhanced
    );

    if (!data.enhanced) {

        console.warn(
            "Word-by-word timing requires enhanced LRC timestamps."
        );

    }

});


// Listen for changes in the current lyric line.

liricle.on("sync", (line, word) => {

    handleLyricSync(line);

});


// Handle failed LRC loading.

liricle.on("loaderror", (error) => {

    lyricsDisplay.textContent = "Could not load lyrics.";

    console.error(
        "Lyrics failed to load:",
        error
    );

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

    // Update word visibility on every animation frame.

    updateWordVisibility(audio.currentTime);

    lyricsFrameId =
        requestAnimationFrame(syncLyricsFrame);

}


// ============================================================
// 9. START AND STOP PLAYBACK LOOPS
// ============================================================

function startPlaybackLoops() {

    // Resume Web Audio when required.

    if (audioCtx.state === "suspended") {

        audioCtx.resume().catch(error => {

            console.warn(
                "AudioContext could not resume:",
                error
            );

        });

    }

    // Start visualizer.

    if (visualizerFrameId === null) {

        visualizerFrameId =
            requestAnimationFrame(animateVisualizer);

    }

    // Synchronize lyrics immediately.

    liricle.sync(audio.currentTime, true);

    updateWordVisibility(audio.currentTime);

    // Start lyrics animation loop.

    if (lyricsFrameId === null) {

        lyricsFrameId =
            requestAnimationFrame(syncLyricsFrame);

    }

}


// ============================================================
// 10. PAUSE AND SEEK HANDLING
// ============================================================

function stopLyricsLoop() {

    if (lyricsFrameId !== null) {

        cancelAnimationFrame(lyricsFrameId);

        lyricsFrameId = null;

    }

    updateWordVisibility(audio.currentTime);

}


// PLAY

audio.addEventListener(
    "play",
    startPlaybackLoops
);


// PAUSE

audio.addEventListener(
    "pause",
    stopLyricsLoop
);


// END

audio.addEventListener(
    "ended",
    stopLyricsLoop
);


// SEEK

audio.addEventListener("seeked", () => {

    // Update lyrics when the user moves the audio timeline.

    liricle.sync(audio.currentTime, true);

    updateWordVisibility(audio.currentTime);

});


// ============================================================
// 11. LOAD THE ENHANCED LRC FILE
// ============================================================

liricle.load({

    url: "assets/dandelions_enhanced.lrc"

});