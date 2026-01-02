const visualizerGrid = document.getElementById("visualizer-grid");
const generateBtn = document.getElementById("generate-btn");
const sortBtn = document.getElementById("sort-btn");
const arraySizeInput = document.getElementById("array-size");
const speedInput = document.getElementById("speed");
const soundToggle = document.getElementById("sound-toggle");
const algorithmSelect = document.getElementById("algorithm-select");
const rainbowToggle = document.getElementById("rainbow-toggle");

// Leaderboard Elements
const leaderboardModal = document.getElementById("leaderboard-modal");
const leaderboardTableBody = document.querySelector("#leaderboard-table tbody");
const closeModalBtn = document.querySelector(".close-modal");

// Global State

// Global State
let activeVisualizers = [];
let isSorting = false;
let currentBaseArray = []; // Stores the raw numbers so every algo gets the same data
let currentDelay = 50; // Cached delay value
let lastNoteTime = 0; // For sound throttling
let animationFrameId = null; // For UI loop


class SortVisualizer {
    constructor(algoId, algoName) {
        this.algoId = algoId;
        this.algoName = algoName;
        this.comparisons = 0;
        this.swaps = 0;
        this.startTime = 0;
        this.endTime = 0;
        this.bars = [];
        this.containerInfo = this.createFrame();
    }

    createFrame() {
        const frame = document.createElement('div');
        frame.className = 'visualizer-frame';
        frame.innerHTML = `
            <div class="frame-header">
                <h3>${this.algoName}</h3>
                <div class="frame-stats">
                    <div class="frame-stat">C: <span class="cmp-count">0</span></div>
                    <div class="frame-stat">S: <span class="swp-count">0</span></div>
                </div>
            </div>
            <div class="frame-container"></div>
        `;
        visualizerGrid.appendChild(frame);
        return {
            frame: frame,
            barContainer: frame.querySelector('.frame-container'),
            cmpSpan: frame.querySelector('.cmp-count'),
            swpSpan: frame.querySelector('.swp-count')
        };
    }

    populate(data) {
        this.containerInfo.barContainer.innerHTML = '';
        this.bars = [];
        const size = data.length;

        data.forEach(value => {
            const bar = document.createElement("div");
            bar.classList.add("array-bar");
            bar.style.height = `${value}%`;
            // Dynamic width based on size, maxing out for visibility
            // Assuming container width is variable, we use flex grow/shrink or fixed width?
            // Existing logic: width = Math.max(2, Math.floor(1000 / size) - 2);
            // Let's make it responsive. flex-basis or just width.
            const width = Math.max(2, Math.floor(400 / size) - 1); // 400 is rough min-width of frame
            bar.style.width = `${width}px`;

            // Rainbow Mode 🌈
            if (rainbowToggle.checked) {
                // Hue from 0 to 360 based on value (0-100)
                // Normalize value to 0-360 range. Max value is approx 100.
                const hue = Math.floor((value / 100) * 360);
                bar.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
            } else {
                bar.style.backgroundColor = ''; // Reset to CSS default
            }

            this.containerInfo.barContainer.appendChild(bar);
            this.bars.push(bar);
        });

        this.comparisons = 0;
        this.swaps = 0;
        this.updateStatsUI();
    }

    incrementComparison() {
        this.comparisons++;
        // UI update moved to requestAnimationFrame loop
    }

    incrementSwap() {
        this.swaps++;
        // UI update moved to requestAnimationFrame loop
    }

    updateStatsUI() {
        if (this.comparisons % 5 === 0) { // Throttle DOM updates slightly? or not.
            this.containerInfo.cmpSpan.innerText = this.comparisons;
            this.containerInfo.swpSpan.innerText = this.swaps;
        } else {
            // ensure final update
            this.containerInfo.cmpSpan.innerText = this.comparisons;
            this.containerInfo.swpSpan.innerText = this.swaps;
        }
    }

    // Helper to get bars in format expected by algos
    getElements() {
        return this.bars;
    }
}

// Sound Context
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playNote(freq, type = "sine") {
    if (!soundToggle.checked) return;
    if (!audioCtx) initAudio();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();

    // Throttling: limit max notes per second to avoid audio glitches/overload
    const now = performance.now();
    const minInterval = currentDelay < 10 ? 40 : 10; // If very fast, throttle more agressively (max 25 notes/sec) 

    // However, for pure musicality we might want to allow it, but for performance we throttle.
    // Let's rely on the fact that await sleep() is called in the algo.
    // But if delay is 0, we need to throttle sound or it will crash/stutter.
    if (getDelay() === 0 && (now - lastNoteTime < 20)) {
        // Skip audio if running at max speed and too frequent
        osc.stop();
        return;
    }
    lastNoteTime = now;

    // Lower volume if multiple visualizers are running
    const vol = activeVisualizers.length > 1 ? 0.1 : 0.2; // Increased volume

    // Short beep
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);

    osc.stop(audioCtx.currentTime + 0.1);
}

// Old global array/sorting/speed variables removed

// Helper to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get speed delay based on slider (inverted so higher slider = faster)
// Get speed delay based on slider (inverted so higher slider = faster)
const updateDelay = () => {
    const val = parseInt(speedInput.value);
    // Exponential curve for better control at high speeds
    // 1 -> 500ms
    // 100 -> 0ms
    // old linear: 500 - (val * 4.95)

    // New logic: 
    // val=100 => 0ms
    // val=99 => ~5ms
    // ...
    // val=1 => 500ms

    // Let's keep it simple for now, but cache it
    currentDelay = Math.floor(500 - (val * 5));
    if (currentDelay < 0) currentDelay = 0;
};

const getDelay = () => currentDelay;

// Initial call
updateDelay();

// Swap Animation Helper
async function swapBars(bar1, bar2) {
    // 1. Calculate distance
    // Optimization: Use offsetLeft which is faster than getBoundingClientRect
    const distance = bar2.offsetLeft - bar1.offsetLeft;

    // 2. Animate Transform
    // We want bar1 to move to bar2, and bar2 to move to bar1
    bar1.style.transform = `translateX(${distance}px)`;
    bar2.style.transform = `translateX(${-distance}px)`;

    // Optimize: If super fast, skip the visual wait to speed up sorting significantly
    if (getDelay() > 0) {
        // Wait for animation
        await sleep(getDelay());
    } else {
        // At max speed, small delay just to let browser render? 
        // Or no delay at all? 
        // If we want instant, we skip await. But let's keep a tiny throttle or else it freezes.
        // Actually, if delay is 0, we can skip the animation transform wait, 
        // but we still likely want to yield for a microtask to update UI rarely?
        await sleep(0);
    }

    // 3. Swap Heights (Actual Data Swap)
    const tempHeight = bar1.style.height;
    bar1.style.height = bar2.style.height;
    bar2.style.height = tempHeight;

    // 4. Reset Transform without animation
    const originalTransition = bar1.style.transition;
    bar1.style.transition = 'none';
    bar2.style.transition = 'none';

    bar1.style.transform = 'translateX(0)';
    bar2.style.transform = 'translateX(0)';

    // 5. Restore Transition (after a micro-tick/reflow)
    // Force reflow
    void bar1.offsetHeight;

    bar1.style.transition = originalTransition;
    bar2.style.transition = originalTransition;
}

// Helpers for Bogo/Bozo Sort
function isSorted(bars) {
    for (let i = 0; i < bars.length - 1; i++) {
        const h1 = parseInt(bars[i].style.height);
        const h2 = parseInt(bars[i + 1].style.height);
        if (h1 > h2) return false;
    }
    return true;
}

async function shuffle(bars, context) {
    const len = bars.length;
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        bars[i].classList.add('bar-swap');
        bars[j].classList.add('bar-swap');

        await swapBars(bars[i], bars[j]);
        context.incrementSwap();

        bars[i].classList.remove('bar-swap');
        bars[j].classList.remove('bar-swap');
    }
}

// Generate random array
// Generate random array data and populate visualizers
const generateArray = () => {
    if (isSorting) return;

    // 1. Determine which algorithms are selected
    const selectedOptions = Array.from(algorithmSelect.selectedOptions);
    if (selectedOptions.length === 0) {
        // Default to bubble if nothing selected (UI should prevent this but safety first)
        // actually if nothing selected, we might just clear. But let's assume at least one.
    }

    // 2. Generate Base Data
    let size = parseInt(arraySizeInput.value);
    if (isNaN(size)) size = 50;
    if (size < 5) size = 5;
    if (size > 100) size = 100;
    arraySizeInput.value = size;

    currentBaseArray = [];
    for (let i = 0; i < size; i++) {
        const value = Math.floor(Math.random() * 95) + 5;
        currentBaseArray.push(value);
    }

    // 3. Re-create Visualizers
    visualizerGrid.innerHTML = '';
    activeVisualizers = [];

    // Grid class toggle for single view centering
    if (selectedOptions.length === 1) {
        visualizerGrid.classList.add('single-view');
    } else {
        visualizerGrid.classList.remove('single-view');
    }

    selectedOptions.forEach(option => {
        const viz = new SortVisualizer(option.value, option.text);
        viz.populate(currentBaseArray);
        activeVisualizers.push(viz);
    });
};

// Toggle Controls
const toggleControls = (disable) => {
    generateBtn.disabled = disable;
    sortBtn.disabled = disable;
    arraySizeInput.disabled = disable;
    algorithmSelect.disabled = disable;
    isSorting = disable;
};

// UI Loop for Stats
const uiLoop = () => {
    activeVisualizers.forEach(viz => {
        // Only touch DOM if values changed (dirty check implies keeping track of last rendered value)
        // But simply updating textContent is reasonably fast if done 60fps instead of 1000s of times/sec
        viz.updateStatsUI();
    });

    if (isSorting) {
        animationFrameId = requestAnimationFrame(uiLoop);
    }
};


// Event Listeners
generateBtn.addEventListener("click", generateArray);
arraySizeInput.addEventListener("input", generateArray);
speedInput.addEventListener("input", updateDelay); // Update delay immediately
// When algorithm selection changes, we don't necessarily regenerate IMMEDIATELY if we want to keep data,
// but for simplicity, let's regenerate to update the view.
// When algorithm selection changes, we don't necessarily regenerate IMMEDIATELY if we want to keep data,
// but for simplicity, we can regenerate to update the view.
algorithmSelect.addEventListener("change", generateArray);
rainbowToggle.addEventListener("change", generateArray); // Re-color on toggle

sortBtn.addEventListener("click", () => {
    initAudio(); // Initialize audio context on user interaction
    startSort();
});

const startSort = async () => {
    if (isSorting) return;
    if (activeVisualizers.length === 0) generateArray(); // ensure we have something

    toggleControls(true);

    // Start UI loop
    uiLoop();

    // Create promises for all active visualizers
    const promises = activeVisualizers.map(async viz => {
        const algo = viz.algoId;
        const bars = viz.bars;
        const context = viz;

        viz.startTime = performance.now();

        if (algo === "bubble") await bubbleSort(bars, context);
        else if (algo === "selection") await selectionSort(bars, context);
        else if (algo === "insertion") await insertionSort(bars, context);
        else if (algo === "merge") await mergeSort(bars, context);
        else if (algo === "quick") await quickSort(bars, context);
        else if (algo === "heap") await heapSort(bars, context);
        else if (algo === "shell") await shellSort(bars, context);
        else if (algo === "cocktail") await cocktailShakerSort(bars, context);
        else if (algo === "comb") await combSort(bars, context);
        else if (algo === "gnome") await gnomeSort(bars, context);

        else if (algo === "pancake") await pancakeSort(bars, context);
        else if (algo === "bitonic") await bitonicSort(bars, context);
        else if (algo === "radix") await radixSort(bars, context);
        else if (algo === "oddeven") await oddEvenSort(bars, context);
        else if (algo === "quick3") await quickSort3Way(bars, context);
        else if (algo === "stooge") await stoogeSort(bars, context);
        else if (algo === "stalin") await stalinSort(bars, context);
        else if (algo === "bogo") await bogoSort(bars, context);
        else if (algo === "bozo") await bozoSort(bars, context);
        else if (algo === "slow") await slowSort(bars, context);
        else if (algo === "double_selection") await doubleSelectionSort(bars, context);
        else if (algo === "timsort") await timSort(bars, context);
        else if (algo === "introsort") await introSort(bars, context);
        else if (algo === "dual_pivot_quick") await dualPivotQuickSort(bars, context);
        else if (algo === "circle") await circleSort(bars, context);
        else if (algo === "strand") await strandSort(bars, context);
        else if (algo === "radix_msb") await radixSortMSB(bars, context);
        else if (algo === "bucket") await bucketSort(bars, context);
        else if (algo === "counting") await countingSort(bars, context);
        else if (algo === "flash") await flashSort(bars, context);
        else if (algo === "american_flag") await americanFlagSort(bars, context);
        else if (algo === "powersort") await powerSort(bars, context);
        else if (algo === "pdqsort") await pdqSort(bars, context);
        else if (algo === "fluxsort") await fluxSort(bars, context);
        else if (algo === "wolfsort") await wolfSort(bars, context);
        else if (algo === "quadsort") await quadSort(bars, context);

        viz.endTime = performance.now();
    });

    await Promise.all(promises);

    cancelAnimationFrame(animationFrameId);
    // Final UI update to ensure correct numbers
    activeVisualizers.forEach(viz => viz.updateStatsUI());

    toggleControls(false);
    showLeaderboard();
};

function showLeaderboard() {
    // Only show if more than one algorithm or if explicitly desired
    // if (activeVisualizers.length < 2) return; 

    // Sort by time (ascending)
    const sortedResults = [...activeVisualizers].sort((a, b) => {
        const timeA = a.endTime - a.startTime;
        const timeB = b.endTime - b.startTime;
        return timeA - timeB;
    });

    leaderboardTableBody.innerHTML = '';

    sortedResults.forEach((viz, index) => {
        const tr = document.createElement('tr');
        const duration = (viz.endTime - viz.startTime).toFixed(2);

        let rankClass = '';
        if (index === 0) rankClass = 'rank-1';
        if (index === 1) rankClass = 'rank-2';
        if (index === 2) rankClass = 'rank-3';

        tr.innerHTML = `
            <td class="${rankClass}">#${index + 1}</td>
            <td class="${rankClass}">${viz.algoName}</td>
            <td>${duration}ms</td>
            <td>${viz.comparisons}</td>
            <td>${viz.swaps}</td>
        `;
        leaderboardTableBody.appendChild(tr);
    });

    leaderboardModal.classList.add('active');
}

closeModalBtn.addEventListener('click', () => {
    leaderboardModal.classList.remove('active');
});

// Close on outside click
leaderboardModal.addEventListener('click', (e) => {
    if (e.target === leaderboardModal) {
        leaderboardModal.classList.remove('active');
    }
});


// Algorithm Placeholders
// Bubble Sort Implementation
async function bubbleSort(bars, context) {
    const len = bars.length;
    for (let i = 0; i < len - 1; i++) {
        for (let j = 0; j < len - i - 1; j++) {
            bars[j].classList.add('bar-compare');
            bars[j + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[j].style.height) * 5); // Compare sound
            await sleep(getDelay());

            const h1 = parseInt(bars[j].style.height);
            const h2 = parseInt(bars[j + 1].style.height);

            context.incrementComparison();
            if (h1 > h2) {
                bars[j].classList.replace('bar-compare', 'bar-swap');
                bars[j + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + h1 * 5, "square"); // Swap sound

                // Animate swap
                await swapBars(bars[j], bars[j + 1]);

                context.incrementSwap();

                bars[j].classList.remove('bar-swap');
                bars[j + 1].classList.remove('bar-swap');
            } else {
                bars[j].classList.remove('bar-compare');
                bars[j + 1].classList.remove('bar-compare');
            }
        }
        bars[len - i - 1].classList.add('bar-sorted');
    }
    bars[0].classList.add('bar-sorted');
}

// Selection Sort Implementation
async function selectionSort(bars, context) {
    const len = bars.length;
    for (let i = 0; i < len; i++) {
        let minIdx = i;
        bars[i].classList.add('bar-compare');

        for (let j = i + 1; j < len; j++) {
            bars[j].classList.add('bar-compare');
            playNote(200 + parseInt(bars[j].style.height) * 5);
            await sleep(getDelay());

            const h1 = parseInt(bars[j].style.height);
            const h2 = parseInt(bars[minIdx].style.height);

            context.incrementComparison();
            if (h1 < h2) {
                if (minIdx !== i) bars[minIdx].classList.remove('bar-swap');
                minIdx = j;
                bars[minIdx].classList.add('bar-swap');
            } else {
                bars[j].classList.remove('bar-compare');
            }
        }

        if (minIdx !== i) {
            bars[i].classList.add('bar-swap'); // Color source

            await swapBars(bars[i], bars[minIdx]);

            context.incrementSwap();

            bars[minIdx].classList.remove('bar-swap');
            bars[i].classList.remove('bar-swap'); // Color source removal
            playNote(200 + parseInt(bars[i].style.height) * 5, "square");
            bars[minIdx].classList.remove('bar-compare');
        }

        bars[i].classList.remove('bar-compare');
        bars[i].classList.add('bar-sorted');
    }
}

// Insertion Sort Implementation
async function insertionSort(bars, context) {
    const len = bars.length;
    bars[0].classList.add('bar-sorted');

    for (let i = 1; i < len; i++) {
        let j = i;
        const height = bars[i].style.height;
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        while (j > 0) {
            bars[j].classList.add('bar-compare');
            bars[j - 1].classList.add('bar-compare');

            const hPrev = parseInt(bars[j - 1].style.height);
            const hCurr = parseInt(bars[j].style.height);

            context.incrementComparison();
            if (hPrev > hCurr) {
                playNote(200 + hCurr * 5, "square");

                // Swap visual
                bars[j].classList.add('bar-swap');
                bars[j - 1].classList.add('bar-swap');

                await swapBars(bars[j], bars[j - 1]);

                context.incrementSwap();

                bars[j].classList.remove('bar-swap');
                bars[j - 1].classList.remove('bar-swap');

                bars[j].classList.remove('bar-compare');
                bars[j - 1].classList.remove('bar-compare');
                j--;
            } else {
                bars[j].classList.remove('bar-compare');
                bars[j - 1].classList.remove('bar-compare');
                break;
            }
        }
        // Mark sorted up to i
        for (let k = 0; k <= i; k++) bars[k].classList.add('bar-sorted');
    }
}

// Merge Sort Implementation
async function mergeSort(bars, context) {
    await mergeSortRecursive(bars, 0, bars.length - 1, context);
}

async function mergeSortRecursive(bars, start, end, context) {
    if (start >= end) return;

    const mid = Math.floor((start + end) / 2);
    await mergeSortRecursive(bars, start, mid, context);
    await mergeSortRecursive(bars, mid + 1, end, context);
    await merge(bars, start, mid, end, context);
}

async function merge(bars, start, mid, end, context) {
    const leftArr = [];
    const rightArr = [];

    // Create temp arrays
    for (let i = start; i <= mid; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        leftArr.push(bars[i].style.height);
    }
    for (let i = mid + 1; i <= end; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        rightArr.push(bars[i].style.height);
    }

    await sleep(getDelay());

    let i = 0, j = 0, k = start;

    while (i < leftArr.length && j < rightArr.length) {
        const h1 = parseInt(leftArr[i]);
        const h2 = parseInt(rightArr[j]);

        bars[k].classList.add('bar-swap');

        context.incrementComparison();
        if (h1 <= h2) {
            bars[k].style.height = leftArr[i];
            i++;
        } else {
            bars[k].style.height = rightArr[j];
            j++;
        }

        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        context.incrementSwap();
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
    }

    while (i < leftArr.length) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = leftArr[i];
        context.incrementSwap(); // assignment
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        i++;
        k++;
    }

    while (j < rightArr.length) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = rightArr[j];
        context.incrementSwap(); // assignment
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        j++;
        k++;
    }

    // Cleanup colors and mark sorted range (visual approximation)
    for (let x = start; x <= end; x++) {
        bars[x].classList.remove('bar-compare');
        // only mark completely sorted if we are at the top level, 
        // but typically merge sort visualizers color sections as they merge.
        // For simplicity, we can leave them default or mark sorted if it's the final merge.
        if (start === 0 && end === bars.length - 1) bars[x].classList.add('bar-sorted');
    }
}

// Quick Sort Implementation
async function quickSort(bars, context) {
    await quickSortRecursive(bars, 0, bars.length - 1, context);
    // Final verification color
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function quickSortRecursive(bars, low, high, context) {
    if (low < high) {
        const pi = await partition(bars, low, high, context);
        await quickSortRecursive(bars, low, pi - 1, context);
        await quickSortRecursive(bars, pi + 1, high, context);
    }
}

async function partition(bars, low, high, context) {
    const pivot = parseInt(bars[high].style.height);
    bars[high].classList.add('bar-compare'); // pivot color

    let i = low - 1;

    for (let j = low; j < high; j++) {
        bars[j].classList.add('bar-compare');
        playNote(200 + parseInt(bars[j].style.height) * 5);
        await sleep(getDelay());

        const currentHeight = parseInt(bars[j].style.height);

        context.incrementComparison();
        if (currentHeight < pivot) {
            i++;
            // swap i and j
            bars[i].classList.add('bar-swap');
            bars[j].classList.add('bar-swap');

            await swapBars(bars[i], bars[j]);

            context.incrementSwap();

            bars[i].classList.remove('bar-swap');
            bars[j].classList.remove('bar-swap');
        }
        bars[j].classList.remove('bar-compare');
    }

    // Swap i+1 and pivot (high)
    await swapBars(bars[i + 1], bars[high]);
    context.incrementSwap();

    bars[high].classList.remove('bar-compare');

    return i + 1;
}

// Heap Sort Implementation
async function heapSort(bars, context) {
    const len = bars.length;

    // Build max heap
    for (let i = Math.floor(len / 2) - 1; i >= 0; i--) {
        await heapify(bars, len, i, context);
    }

    // Extraction
    for (let i = len - 1; i > 0; i--) {
        // Swap root (max) with i
        bars[0].classList.add('bar-swap');
        bars[i].classList.add('bar-swap');
        playNote(200 + parseInt(bars[0].style.height) * 5, "square");

        await swapBars(bars[0], bars[i]);
        context.incrementSwap();

        bars[0].classList.remove('bar-swap');
        bars[i].classList.remove('bar-swap');

        bars[i].classList.add('bar-sorted'); // i is now sorted

        // Heapify root
        await heapify(bars, i, 0, context);
    }
    bars[0].classList.add('bar-sorted');
}

async function heapify(bars, n, i, context) {
    let largest = i;
    const l = 2 * i + 1;
    const r = 2 * i + 2;

    if (l < n) {
        bars[l].classList.add('bar-compare');
        bars[largest].classList.add('bar-compare');
        context.incrementComparison();
        playNote(200 + parseInt(bars[l].style.height) * 5);
        await sleep(getDelay());
        if (parseInt(bars[l].style.height) > parseInt(bars[largest].style.height)) {
            largest = l;
        }
        bars[l].classList.remove('bar-compare');
        bars[largest].classList.remove('bar-compare');
    }

    if (r < n) {
        bars[r].classList.add('bar-compare');
        bars[largest].classList.add('bar-compare');
        context.incrementComparison();
        playNote(200 + parseInt(bars[r].style.height) * 5);
        await sleep(getDelay());
        if (parseInt(bars[r].style.height) > parseInt(bars[largest].style.height)) {
            largest = r;
        }
        bars[r].classList.remove('bar-compare');
        bars[largest].classList.remove('bar-compare');
    }

    if (largest !== i) {
        bars[i].classList.add('bar-swap');
        bars[largest].classList.add('bar-swap');
        playNote(200 + parseInt(bars[i].style.height) * 5, "square");

        await swapBars(bars[i], bars[largest]);
        context.incrementSwap();

        bars[i].classList.remove('bar-swap');
        bars[largest].classList.remove('bar-swap');

        await heapify(bars, n, largest, context);
    }
}

// Shell Sort Implementation
async function shellSort(bars, context) {
    const len = bars.length;

    // Start with a big gap, then reduce the gap
    for (let gap = Math.floor(len / 2); gap > 0; gap = Math.floor(gap / 2)) {

        // Do a gapped insertion sort
        for (let i = gap; i < len; i++) {
            let tempHeight = bars[i].style.height;
            let tempVal = parseInt(tempHeight);

            bars[i].classList.add('bar-compare');
            playNote(200 + tempVal * 5);
            await sleep(getDelay());

            let j;
            for (j = i; j >= gap; j -= gap) {
                // Compare bars[j] and bars[j-gap]
                bars[j].classList.add('bar-compare');
                bars[j - gap].classList.add('bar-compare');
                context.incrementComparison();
                playNote(200 + parseInt(bars[j - gap].style.height) * 5);
                await sleep(getDelay());

                const valCurr = parseInt(bars[j].style.height);
                const valPrev = parseInt(bars[j - gap].style.height);

                if (valPrev > valCurr) {
                    // Swap
                    bars[j].classList.add('bar-swap');
                    bars[j - gap].classList.add('bar-swap');
                    playNote(200 + valPrev * 5, "square");

                    await swapBars(bars[j], bars[j - gap]);
                    context.incrementSwap();

                    bars[j].classList.remove('bar-swap');
                    bars[j - gap].classList.remove('bar-swap');
                    bars[j].classList.remove('bar-compare');
                    bars[j - gap].classList.remove('bar-compare');
                } else {
                    bars[j].classList.remove('bar-compare');
                    bars[j - gap].classList.remove('bar-compare');
                    break;
                }
            }
            bars[i].classList.remove('bar-compare');
            // No final placement needed as we swapped all the way down
        }
    }

    // Final verification color
    for (let i = 0; i < len; i++) bars[i].classList.add('bar-sorted');
}

// Cocktail Shaker Sort Implementation
async function cocktailShakerSort(bars, context) {
    let sorted = false;
    let start = 0;
    let end = bars.length - 1;

    while (sorted === false) {
        sorted = true;

        // Forward pass
        for (let i = start; i < end; i++) {
            bars[i].classList.add('bar-compare');
            bars[i + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());

            context.incrementComparison();
            if (parseInt(bars[i].style.height) > parseInt(bars[i + 1].style.height)) {
                // Swap
                bars[i].classList.replace('bar-compare', 'bar-swap');
                bars[i + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + parseInt(bars[i + 1].style.height) * 5, "square");

                await swapBars(bars[i], bars[i + 1]);

                context.incrementSwap();

                bars[i].classList.remove('bar-swap');
                bars[i + 1].classList.remove('bar-swap');

                sorted = false;
            } else {
                bars[i].classList.remove('bar-compare');
                bars[i + 1].classList.remove('bar-compare');
            }
        }
        bars[end].classList.add('bar-sorted');
        end--;

        if (sorted) break;

        sorted = true;

        // Backward pass
        for (let i = end - 1; i >= start; i--) {
            bars[i].classList.add('bar-compare');
            bars[i + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());

            context.incrementComparison();
            if (parseInt(bars[i].style.height) > parseInt(bars[i + 1].style.height)) {
                // Swap
                bars[i].classList.replace('bar-compare', 'bar-swap');
                bars[i + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + parseInt(bars[i + 1].style.height) * 5, "square");

                await swapBars(bars[i], bars[i + 1]);

                context.incrementSwap();

                bars[i].classList.remove('bar-swap');
                bars[i + 1].classList.remove('bar-swap');

                sorted = false;
            } else {
                bars[i].classList.remove('bar-compare');
                bars[i + 1].classList.remove('bar-compare');
            }
        }
        bars[start].classList.add('bar-sorted');
        start++;
    }

    // Mark remaining as sorted
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// Comb Sort Implementation
async function combSort(bars, context) {
    let gap = bars.length;
    let shrink = 1.3;
    let sorted = false;

    while (!sorted) {
        gap = Math.floor(gap / shrink);
        if (gap <= 1) {
            gap = 1;
            sorted = true;
        }

        for (let i = 0; i + gap < bars.length; i++) {
            bars[i].classList.add('bar-compare');
            bars[i + gap].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());

            context.incrementComparison();
            if (parseInt(bars[i].style.height) > parseInt(bars[i + gap].style.height)) {
                bars[i].classList.replace('bar-compare', 'bar-swap');
                bars[i + gap].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + parseInt(bars[i].style.height) * 5, "square");

                await swapBars(bars[i], bars[i + gap]);

                context.incrementSwap();
                sorted = false;

                bars[i].classList.remove('bar-swap');
                bars[i + gap].classList.remove('bar-swap');
            } else {
                bars[i].classList.remove('bar-compare');
                bars[i + gap].classList.remove('bar-compare');
            }
        }
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// Gnome Sort Implementation
async function gnomeSort(bars, context) {
    let index = 0;
    while (index < bars.length) {
        if (index === 0) index++;

        bars[index].classList.add('bar-compare');
        bars[index - 1].classList.add('bar-compare');
        playNote(200 + parseInt(bars[index].style.height) * 5);
        await sleep(getDelay());

        const h1 = parseInt(bars[index].style.height);
        const h2 = parseInt(bars[index - 1].style.height);

        context.incrementComparison();
        if (h1 >= h2) {
            bars[index].classList.remove('bar-compare');
            bars[index - 1].classList.remove('bar-compare');
            index++;
        } else {
            bars[index].classList.replace('bar-compare', 'bar-swap');
            bars[index - 1].classList.replace('bar-compare', 'bar-swap');
            playNote(200 + parseInt(bars[index].style.height) * 5, "square");

            await swapBars(bars[index], bars[index - 1]);

            context.incrementSwap();

            bars[index].classList.remove('bar-swap');
            bars[index - 1].classList.remove('bar-swap');

            index--;
        }
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}



// Pancake Sort Implementation
async function pancakeSort(bars, context) {
    for (let currSize = bars.length; currSize > 1; currSize--) {
        // Find index of max element in arr[0..currSize-1]
        let maxIdx = 0;

        for (let i = 0; i < currSize; i++) {
            bars[i].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay() / 4);

            context.incrementComparison();
            if (parseInt(bars[i].style.height) > parseInt(bars[maxIdx].style.height)) {
                bars[maxIdx].classList.remove('bar-swap'); // unmark old max
                maxIdx = i;
                bars[maxIdx].classList.add('bar-swap'); // mark new max
            } else {
                bars[i].classList.remove('bar-compare');
            }
        }

        await sleep(getDelay());

        if (maxIdx !== currSize - 1) {
            // Flip 0 to maxIdx
            if (maxIdx > 0) {
                await flip(bars, maxIdx, context);
            }
            // Flip 0 to currSize-1
            await flip(bars, currSize - 1, context);
        }

        // Clean up visual state for this pass
        for (let k = 0; k < currSize; k++) {
            bars[k].classList.remove('bar-compare');
            bars[k].classList.remove('bar-swap');
        }
        bars[currSize - 1].classList.add('bar-sorted');
    }
    bars[0].classList.add('bar-sorted');
}

async function flip(bars, k, context) {
    let left = 0;
    while (left < k) {
        bars[left].classList.add('bar-swap');
        bars[k].classList.add('bar-swap');

        await swapBars(bars[left], bars[k]);

        playNote(200 + parseInt(bars[left].style.height) * 5, "square");
        context.incrementSwap();

        bars[left].classList.remove('bar-swap');
        bars[k].classList.remove('bar-swap');

        left++;
        k--;
    }
}

// Initialize
generateArray();

// Bitonic Sort Implementation
async function bitonicSort(bars, context) {
    const len = bars.length;
    // Bitonic sort works best with powers of 2, but we can try to adapt or just sort up to nearest power of 2?
    // Or we can just pad comparison logic.
    // Standard iterative bitonic sort.

    // Note: This specific implementation assumes length is power of 2 for perfect bitonic sorting.
    // However, visualizing it generally might be tricky if size is not 2^k.
    // We will attempt a general version or just simple version.

    // Let's implement the recursive structure iteratively for visualization.

    for (let k = 2; k <= len; k *= 2) { // k is window size
        for (let j = k / 2; j > 0; j = Math.floor(j / 2)) {
            for (let i = 0; i < len; i++) {
                let l = i ^ j;
                if (l > i && l < len) {
                    // direction determination
                    let ascending = (i & k) === 0;

                    bars[i].classList.add('bar-compare');
                    bars[l].classList.add('bar-compare');
                    playNote(200 + parseInt(bars[i].style.height) * 5);
                    await sleep(getDelay());
                    context.incrementComparison();

                    const h1 = parseInt(bars[i].style.height);
                    const h2 = parseInt(bars[l].style.height);

                    if ((ascending && h1 > h2) || (!ascending && h1 < h2)) {
                        bars[i].classList.replace('bar-compare', 'bar-swap');
                        bars[l].classList.replace('bar-compare', 'bar-swap');
                        playNote(200 + h2 * 5, "square");

                        await swapBars(bars[i], bars[l]);

                        context.incrementSwap();

                        bars[i].classList.remove('bar-swap');
                        bars[l].classList.remove('bar-swap');
                    } else {
                        bars[i].classList.remove('bar-compare');
                        bars[l].classList.remove('bar-compare');
                    }
                }
            }
        }
    }
    // Clean up
    for (let i = 0; i < len; i++) bars[i].classList.remove('bar-compare');
    for (let i = 0; i < len; i++) bars[i].classList.add('bar-sorted');
}

// Radix Sort Implementation (LSD)
async function radixSort(bars, context) {
    // Finding max to know digit count
    let maxVal = 0;
    for (let i = 0; i < bars.length; i++) {
        bars[i].classList.add('bar-compare');
        maxVal = Math.max(maxVal, parseInt(bars[i].style.height));
    }
    await sleep(getDelay());
    for (let i = 0; i < bars.length; i++) bars[i].classList.remove('bar-compare');

    // Do counting sort for every digit. Exp is 1, 10, 100...
    for (let exp = 1; Math.floor(maxVal / exp) > 0; exp *= 10) {
        await countSort(bars, exp, context);
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function countSort(bars, exp, context) {
    let output = new Array(bars.length).fill(0);
    let count = new Array(10).fill(0);
    const len = bars.length;

    // Store count of occurrences
    for (let i = 0; i < len; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        let val = parseInt(bars[i].style.height);
        count[Math.floor(val / exp) % 10]++;

        // Visualize scanning
        await sleep(getDelay() / 2);
        bars[i].classList.remove('bar-compare');
    }

    // Change count[i] so that count[i] contains actual position of this digit in output[]
    for (let i = 1; i < 10; i++) {
        count[i] += count[i - 1];
    }

    // Build the output array - reverse order to keep stable
    for (let i = len - 1; i >= 0; i--) {
        let val = parseInt(bars[i].style.height);
        output[count[Math.floor(val / exp) % 10] - 1] = val;
        count[Math.floor(val / exp) % 10]--;
    }

    // Copy the output array to bars, so that bars now contains sorted numbers according to current digit
    for (let i = 0; i < len; i++) {
        bars[i].classList.add('bar-swap');
        context.incrementSwap(); // It's an overwrite
        bars[i].style.height = `${output[i]}%`;
        playNote(200 + parseInt(bars[i].style.height) * 5, "square");
        await sleep(getDelay());
        bars[i].classList.remove('bar-swap');
    }
}


// Odd-Even Sort Implementation
async function oddEvenSort(bars, context) {
    let sorted = false;
    while (!sorted) {
        sorted = true;
        // Odd phase
        for (let i = 1; i <= bars.length - 2; i += 2) {
            bars[i].classList.add('bar-compare');
            bars[i + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());
            context.incrementComparison();

            if (parseInt(bars[i].style.height) > parseInt(bars[i + 1].style.height)) {
                bars[i].classList.replace('bar-compare', 'bar-swap');
                bars[i + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + parseInt(bars[i + 1].style.height) * 5, "square");

                await swapBars(bars[i], bars[i + 1]);

                context.incrementSwap();
                sorted = false;

                bars[i].classList.remove('bar-swap');
                bars[i + 1].classList.remove('bar-swap');
            } else {
                bars[i].classList.remove('bar-compare');
                bars[i + 1].classList.remove('bar-compare');
            }
        }

        // Even phase
        for (let i = 0; i <= bars.length - 2; i += 2) {
            bars[i].classList.add('bar-compare');
            bars[i + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());
            context.incrementComparison();

            if (parseInt(bars[i].style.height) > parseInt(bars[i + 1].style.height)) {
                bars[i].classList.replace('bar-compare', 'bar-swap');
                bars[i + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + parseInt(bars[i + 1].style.height) * 5, "square");

                await swapBars(bars[i], bars[i + 1]);

                context.incrementSwap();
                sorted = false;

                bars[i].classList.remove('bar-swap');
                bars[i + 1].classList.remove('bar-swap');
            } else {
                bars[i].classList.remove('bar-compare');
                bars[i + 1].classList.remove('bar-compare');
            }
        }
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// 3-Way Quick Sort Implementation
async function quickSort3Way(bars, context) {
    await quickSort3WayRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function quickSort3WayRecursive(bars, low, high, context) {
    if (low >= high) return;

    let lt = low, gt = high;
    let pivot = parseInt(bars[low].style.height);
    bars[low].classList.add('bar-compare'); // pivot color

    let i = low + 1;

    while (i <= gt) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        let curr = parseInt(bars[i].style.height);
        context.incrementComparison();

        if (curr < pivot) {
            bars[i].classList.replace('bar-compare', 'bar-swap');
            bars[lt].classList.add('bar-swap');

            await swapBars(bars[lt], bars[i]);

            playNote(200 + curr * 5, "square");
            context.incrementSwap();

            bars[lt].classList.remove('bar-swap');
            bars[i].classList.remove('bar-swap');
            bars[i].classList.remove('bar-compare'); // handled
            if (lt !== i) bars[lt].classList.remove('bar-compare'); // unmark old pivot/lt if moved

            lt++;
            i++;
        } else if (curr > pivot) {
            bars[i].classList.replace('bar-compare', 'bar-swap');
            bars[gt].classList.add('bar-swap');

            await swapBars(bars[i], bars[gt]);

            playNote(200 + curr * 5, "square");
            context.incrementSwap();

            bars[gt].classList.remove('bar-swap');
            bars[i].classList.remove('bar-swap');
            // Do not increment i, examine swapped element
            bars[gt].classList.remove('bar-compare');
            gt--;
        } else {
            bars[i].classList.remove('bar-compare');
            i++;
        }
    }

    await quickSort3WayRecursive(bars, low, lt - 1, context);
    await quickSort3WayRecursive(bars, gt + 1, high, context);
}

// Stooge Sort Implementation
async function stoogeSort(bars, context) {
    await stoogeSortRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function stoogeSortRecursive(bars, l, h, context) {
    if (l >= h) return;

    bars[l].classList.add('bar-compare');
    bars[h].classList.add('bar-compare');
    playNote(200 + parseInt(bars[l].style.height) * 5);
    await sleep(getDelay());
    context.incrementComparison();

    if (parseInt(bars[l].style.height) > parseInt(bars[h].style.height)) {
        bars[l].classList.replace('bar-compare', 'bar-swap');
        bars[h].classList.replace('bar-compare', 'bar-swap');
        playNote(200 + parseInt(bars[h].style.height) * 5, "square");

        await swapBars(bars[l], bars[h]);

        context.incrementSwap();

        bars[l].classList.remove('bar-swap');
        bars[h].classList.remove('bar-swap');
    } else {
        bars[l].classList.remove('bar-compare');
        bars[h].classList.remove('bar-compare');
    }

    if (h - l + 1 > 2) {
        let t = Math.floor((h - l + 1) / 3);
        await stoogeSortRecursive(bars, l, h - t, context);
        await stoogeSortRecursive(bars, l + t, h, context);
        await stoogeSortRecursive(bars, l, h - t, context);
    }
}

// Stalin Sort Implementation
async function stalinSort(bars, context) {
    if (bars.length === 0) return;

    // Initial verification scan
    let maxVal = parseInt(bars[0].style.height);
    bars[0].classList.add('bar-sorted');

    // We need to handle dynamic removal, so we can't just iterate simply with a fixed index if we splice array
    // However, the 'bars' array passed is a reference to the visualizer's validation array.
    // BUT the visually reflected elements are children of container.
    // The visualization logic often relies on the array being consistent with DOM.
    // Let's iterate and remove from DOM and array.

    let i = 1;
    while (i < bars.length) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        const currentVal = parseInt(bars[i].style.height);

        context.incrementComparison();
        if (currentVal < maxVal) {
            // ELIMINATE
            playNote(100, "sawtooth"); // harsher sound for elimination
            bars[i].style.backgroundColor = 'red';
            await sleep(getDelay());

            // Remove from DOM
            bars[i].remove();
            // Remove from array
            bars.splice(i, 1);

            // Do not increment i, as the next element slides into this index
        } else {
            maxVal = currentVal;
            bars[i].classList.remove('bar-compare');
            bars[i].classList.add('bar-sorted');
            i++;
        }
    }
}

// Bogo Sort Implementation
async function bogoSort(bars, context) {
    while (!isSorted(bars)) {
        await shuffle(bars, context);
        // Visual check (brief pause to show we checked)
        playNote(600, "sine");
        await sleep(getDelay());
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// Bozo Sort Implementation
async function bozoSort(bars, context) {
    while (!isSorted(bars)) {
        // Pick two random indices
        const len = bars.length;
        const i = Math.floor(Math.random() * len);
        const j = Math.floor(Math.random() * len);

        bars[i].classList.add('bar-compare');
        bars[j].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);

        await sleep(getDelay());

        context.incrementSwap(); // Bozo swaps regardless? Or only if needed? 
        // Standard Bozo swaps two random elements. Checking if they are in order is an optimization for "unintelligent" sorting?
        // Actually Bozo just swaps two random and checks if sorted.

        bars[i].classList.replace('bar-compare', 'bar-swap');
        bars[j].classList.replace('bar-compare', 'bar-swap');
        await swapBars(bars[i], bars[j]);

        bars[i].classList.remove('bar-swap');
        bars[j].classList.remove('bar-swap');
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// Slow Sort Implementation
async function slowSort(bars, context) {
    await slowSortRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function slowSortRecursive(bars, i, j, context) {
    if (i >= j) return;

    const m = Math.floor((i + j) / 2);

    await slowSortRecursive(bars, i, m, context);
    await slowSortRecursive(bars, m + 1, j, context);

    bars[j].classList.add('bar-compare');
    bars[m].classList.add('bar-compare');
    playNote(200 + parseInt(bars[j].style.height) * 5);
    await sleep(getDelay());

    context.incrementComparison();
    if (parseInt(bars[j].style.height) < parseInt(bars[m].style.height)) {
        bars[j].classList.replace('bar-compare', 'bar-swap');
        bars[m].classList.replace('bar-compare', 'bar-swap');
        await swapBars(bars[j], bars[m]);
        context.incrementSwap();
        bars[j].classList.remove('bar-swap');
        bars[m].classList.remove('bar-swap');
    } else {
        bars[j].classList.remove('bar-compare');
        bars[m].classList.remove('bar-compare');
    }

    await slowSortRecursive(bars, i, j - 1, context);
}

// Double Selection Sort Implementation
async function doubleSelectionSort(bars, context) {
    let left = 0;
    let right = bars.length - 1;

    while (left <= right) {
        let minIdx = left;
        let maxIdx = right; // Start assuming, but we scan properly
        // Actually better to initialize maxIdx = left or similar to avoid issues if right is smaller than everything
        maxIdx = left;

        // Find min and max
        for (let i = left; i <= right; i++) {
            bars[i].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            // Throttle internal loop delay for speed
            await sleep(getDelay() / 2);
            context.incrementComparison();

            const val = parseInt(bars[i].style.height);
            if (val < parseInt(bars[minIdx].style.height)) {
                minIdx = i;
            }
            if (val > parseInt(bars[maxIdx].style.height)) {
                maxIdx = i;
            }
            bars[i].classList.remove('bar-compare');
        }

        // Swap min to left
        if (minIdx !== left) {
            bars[left].classList.add('bar-swap');
            bars[minIdx].classList.add('bar-swap');
            await swapBars(bars[left], bars[minIdx]);
            context.incrementSwap();
            bars[left].classList.remove('bar-swap');
            bars[minIdx].classList.remove('bar-swap');

            // If max was at left, it has now moved to minIdx
            if (maxIdx === left) {
                maxIdx = minIdx;
            }
        }

        // Swap max to right
        if (maxIdx !== right) {
            bars[right].classList.add('bar-swap');
            bars[maxIdx].classList.add('bar-swap');
            await swapBars(bars[right], bars[maxIdx]);
            context.incrementSwap();
            bars[right].classList.remove('bar-swap');
            bars[maxIdx].classList.remove('bar-swap');
        }

        bars[left].classList.add('bar-sorted');
        bars[right].classList.add('bar-sorted');

        left++;
        right--;
    }
}


// Timsort Implementation
async function timSort(bars, context) {
    const n = bars.length;
    // For visualization, we use a smaller run size to show merging frequently
    const RUN = 10;

    // Sort individual subarrays of size RUN
    for (let i = 0; i < n; i += RUN) {
        await timInsertionSort(bars, i, Math.min((i + RUN - 1), (n - 1)), context);
    }

    // Merge runs
    for (let size = RUN; size < n; size = 2 * size) {
        for (let left = 0; left < n; left += 2 * size) {
            const mid = left + size - 1;
            const right = Math.min((left + 2 * size - 1), (n - 1));

            if (mid < right) {
                await timMerge(bars, left, mid, right, context);
            }
        }
    }
    // Final sorted color
    for (let i = 0; i < n; i++) bars[i].classList.add('bar-sorted');
}

async function timInsertionSort(bars, left, right, context) {
    for (let i = left + 1; i <= right; i++) {
        let j = i;
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        while (j > left) {
            bars[j].classList.add('bar-compare');
            bars[j - 1].classList.add('bar-compare');

            const h1 = parseInt(bars[j].style.height);
            const h2 = parseInt(bars[j - 1].style.height);

            context.incrementComparison();
            if (h2 > h1) {
                playNote(200 + h1 * 5, "square");
                bars[j].classList.add('bar-swap');
                bars[j - 1].classList.add('bar-swap');

                await swapBars(bars[j], bars[j - 1]);
                context.incrementSwap();

                bars[j].classList.remove('bar-swap');
                bars[j - 1].classList.remove('bar-swap');
                j--;
            } else {
                bars[j].classList.remove('bar-compare');
                bars[j - 1].classList.remove('bar-compare');
                break;
            }
            bars[j].classList.remove('bar-compare');
            bars[j + 1].classList.remove('bar-compare');
        }
        bars[i].classList.remove('bar-compare');
    }
}

async function timMerge(bars, l, m, r, context) {
    const len1 = m - l + 1;
    const len2 = r - m;
    const leftArr = [];
    const rightArr = [];

    for (let i = 0; i < len1; i++) {
        leftArr.push(bars[l + i].style.height);
        bars[l + i].classList.add('bar-compare');
    }
    for (let i = 0; i < len2; i++) {
        rightArr.push(bars[m + 1 + i].style.height);
        bars[m + 1 + i].classList.add('bar-compare');
    }

    await sleep(getDelay());

    let i = 0;
    let j = 0;
    let k = l;

    while (i < len1 && j < len2) {
        const h1 = parseInt(leftArr[i]);
        const h2 = parseInt(rightArr[j]);

        bars[k].classList.add('bar-swap');
        context.incrementComparison();

        if (h1 <= h2) {
            bars[k].style.height = leftArr[i];
            i++;
        } else {
            bars[k].style.height = rightArr[j];
            j++;
        }
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        context.incrementSwap(); // assignment
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
    }

    while (i < len1) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = leftArr[i];
        context.incrementSwap();
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
        i++;
    }

    while (j < len2) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = rightArr[j];
        context.incrementSwap();
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
        j++;
    }

    // Cleanup
    for (let x = l; x <= r; x++) bars[x].classList.remove('bar-compare');
}

// Introsort Implementation
async function introSort(bars, context) {
    const n = bars.length;
    const maxDepth = Math.floor(Math.log2(n)) * 2;
    await introSortUtil(bars, 0, n - 1, maxDepth, context);
    // Final insertion sort pass to be sure
    await insertionSort(bars, context);
}

async function introSortUtil(bars, begin, end, depthLimit, context) {
    const size = end - begin;
    if (size < 16) {
        // Insertion sort is faster for small arrays
        // We will do a full insertion sort at the end, or small ones here.
        // Standard introsort does insertion sort here or leaves it for the end.
        // Let's do nothing here and rely on the global insertion pass? 
        // Or do insertion sort here.
        await timInsertionSort(bars, begin, end, context);
        return;
    }

    if (depthLimit === 0) {
        // Heapsort on this partition
        await heapSortRange(bars, begin, end, context);
        return;
    }

    const pivotIdx = await partition(bars, begin, end, context);
    await introSortUtil(bars, begin, pivotIdx - 1, depthLimit - 1, context);
    await introSortUtil(bars, pivotIdx + 1, end, depthLimit - 1, context);
}

// Helper for Heapsort on a range
async function heapSortRange(bars, start, end, context) {
    const n = end - start + 1;

    // Build max heap in the range
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        await heapifyRange(bars, n, i, start, context);
    }

    // Extraction
    for (let i = n - 1; i > 0; i--) {
        // Swap root (start) with current last (start + i)
        bars[start].classList.add('bar-swap');
        bars[start + i].classList.add('bar-swap');
        playNote(200 + parseInt(bars[start].style.height) * 5, "square");

        await swapBars(bars[start], bars[start + i]);
        context.incrementSwap();

        bars[start].classList.remove('bar-swap');
        bars[start + i].classList.remove('bar-swap');

        // Heapify root
        await heapifyRange(bars, i, 0, start, context);
    }
}

async function heapifyRange(bars, n, i, offset, context) {
    let largest = i;
    const l = 2 * i + 1;
    const r = 2 * i + 2;

    const idxLargest = offset + largest;
    const idxL = offset + l;
    const idxR = offset + r;

    if (l < n) {
        bars[idxL].classList.add('bar-compare');
        bars[idxLargest].classList.add('bar-compare');
        context.incrementComparison();
        playNote(200 + parseInt(bars[idxL].style.height) * 5);
        await sleep(getDelay());

        if (parseInt(bars[idxL].style.height) > parseInt(bars[idxLargest].style.height)) {
            largest = l;
        }
        bars[idxL].classList.remove('bar-compare');
        bars[idxLargest].classList.remove('bar-compare');
    }

    if (r < n) {
        // Recalculate idxLargest because largest might have changed
        const currentIdxLargest = offset + largest;
        bars[idxR].classList.add('bar-compare');
        bars[currentIdxLargest].classList.add('bar-compare');
        context.incrementComparison();
        await sleep(getDelay());

        if (parseInt(bars[idxR].style.height) > parseInt(bars[currentIdxLargest].style.height)) {
            largest = r;
        }
        bars[idxR].classList.remove('bar-compare');
        bars[currentIdxLargest].classList.remove('bar-compare');
    }

    if (largest !== i) {
        const idxI = offset + i;
        const idxNewLargest = offset + largest;

        bars[idxI].classList.add('bar-swap');
        bars[idxNewLargest].classList.add('bar-swap');
        playNote(200 + parseInt(bars[idxI].style.height) * 5, "square");

        await swapBars(bars[idxI], bars[idxNewLargest]);
        context.incrementSwap();

        bars[idxI].classList.remove('bar-swap');
        bars[idxNewLargest].classList.remove('bar-swap');

        await heapifyRange(bars, n, largest, offset, context);
    }
}


// Dual-Pivot QuickSort Implementation
async function dualPivotQuickSort(bars, context) {
    await dualPivotRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function dualPivotRecursive(bars, low, high, context) {
    if (low < high) {
        // Swap low and high if low > high to ensure p1 <= p2
        let hLow = parseInt(bars[low].style.height);
        let hHigh = parseInt(bars[high].style.height);

        context.incrementComparison();
        if (hLow > hHigh) {
            await swapBars(bars[low], bars[high]);
            context.incrementSwap();
        }

        const p1 = parseInt(bars[low].style.height);
        const p2 = parseInt(bars[high].style.height);

        bars[low].classList.add('bar-compare'); // pivot 1
        bars[high].classList.add('bar-compare'); // pivot 2

        let i = low + 1;
        let k = low + 1;
        let j = high - 1;

        while (k <= j) {
            const val = parseInt(bars[k].style.height);
            context.incrementComparison();

            bars[k].classList.add('bar-compare');
            playNote(200 + val * 5);
            await sleep(getDelay());

            if (val < p1) {
                if (i !== k) {
                    await swapBars(bars[i], bars[k]);
                    context.incrementSwap();
                }
                i++;
                k++;
            } else if (val >= p2) { // optimization
                while (parseInt(bars[j].style.height) > p2 && k < j) {
                    j--;
                    context.incrementComparison();
                }

                await swapBars(bars[k], bars[j]);
                context.incrementSwap();
                j--;

                if (parseInt(bars[k].style.height) < p1) {
                    await swapBars(bars[i], bars[k]);
                    context.incrementSwap();
                    i++;
                }
                k++; // Only increment k if we processed it. 
                // Careful here with the logic logic. 
                // The standard algo:
                // if val < p1: swap(i, k), i++, k++
                // else if val > p2: 
                //    while val(j) > p2 && k < j: j--
                //    swap(k, j), j--
                //    if val(k) < p1: swap(i, k), i++
                //    k++
                // else: k++
            } else {
                k++;
            }
            bars[k - 1]?.classList.remove('bar-compare'); // Cleanup prev
        }

        // Move pivots to correct positions
        i--;
        j++;

        await swapBars(bars[low], bars[i]);
        await swapBars(bars[high], bars[j]);
        context.incrementSwap();
        context.incrementSwap();

        bars[low].classList.remove('bar-compare');
        bars[high].classList.remove('bar-compare');

        // Recurse
        await dualPivotRecursive(bars, low, i - 1, context);
        await dualPivotRecursive(bars, i + 1, j - 1, context);
        await dualPivotRecursive(bars, j + 1, high, context);
    }
}


// Circle Sort Implementation
async function circleSort(bars, context) {
    let sorted = false;
    while (!sorted) {
        sorted = !(await circleSortRecursive(bars, 0, bars.length - 1, context));
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function circleSortRecursive(bars, low, high, context) {
    let swapped = false;
    if (low === high) return false;

    let l = low;
    let r = high;

    while (l < r) {
        const h1 = parseInt(bars[l].style.height);
        const h2 = parseInt(bars[r].style.height);

        bars[l].classList.add('bar-compare');
        bars[r].classList.add('bar-compare');
        playNote(200 + h1 * 5);
        await sleep(getDelay());

        context.incrementComparison();
        if (h1 > h2) {
            playNote(200 + h1 * 5, "square");

            bars[l].classList.add('bar-swap');
            bars[r].classList.add('bar-swap');

            await swapBars(bars[l], bars[r]);
            context.incrementSwap();
            swapped = true;

            bars[l].classList.remove('bar-swap');
            bars[r].classList.remove('bar-swap');
        }

        bars[l].classList.remove('bar-compare');
        bars[r].classList.remove('bar-compare');

        l++;
        r--;
    }

    if (l === r) {
        if (l + 1 <= high) {
            const h1 = parseInt(bars[l].style.height);
            const h2 = parseInt(bars[l + 1].style.height);
            context.incrementComparison();
            if (h1 > h2) {
                playNote(200 + h1 * 5, "square");
                bars[l].classList.add('bar-swap');
                bars[l + 1].classList.add('bar-swap');

                await swapBars(bars[l], bars[l + 1]);
                context.incrementSwap();
                swapped = true;

                bars[l].classList.remove('bar-swap');
                bars[l + 1].classList.remove('bar-swap');
            }
        }
    }

    const mid = Math.floor((high - low) / 2);
    const leftSwapped = await circleSortRecursive(bars, low, low + mid, context);
    const rightSwapped = await circleSortRecursive(bars, low + mid + 1, high, context);

    return swapped || leftSwapped || rightSwapped;
}


// Strand Sort Implementation
// Simulation: Pull strands and merge them into a sorted area at the beginning.
async function strandSort(bars, context) {
    const n = bars.length;
    // We will treat the left part of the array as the "result" list (sorted)
    // and the right part as the "remaining" list.
    // However, strand sort usually creates a NEW list. 
    // We can simulate it by:
    // 1. Identifying a strand in the unsorted part.
    // 2. Moving that strand to a temporary buffer (visualizing it by coloring).
    // 3. Merging that strad with the already sorted prefix.

    // In-place variation:
    // 1. 'sortedCount' tracks the size of the sorted prefix.
    // 2. Scan unsorted part for a sorted subsequence (strand).
    // 3. Move the elements of the strand to be adjacent to 'sortedCount'?
    // That involves a lot of shifting.

    // Simplified In-place visual approach:
    // Iterate until all sorted.

    // We interpret "strand sort" here loosely as "Selection sort but picking a sorted run instead of min".
    // 1. Find a sorted subsequence from the unsorted portion.
    // 2. Merge this subsequence into the sorted portion.

    let sortedCount = 0;
    while (sortedCount < n) {
        // 1. Extract Strand
        // The first element of unsorted part is always first in strand.
        let strandIndices = [sortedCount];
        let lastVal = parseInt(bars[sortedCount].style.height);

        bars[sortedCount].classList.add('bar-compare'); // Mark as start of strand

        for (let i = sortedCount + 1; i < n; i++) {
            bars[i].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay());

            const currVal = parseInt(bars[i].style.height);
            context.incrementComparison();

            if (currVal >= lastVal) {
                strandIndices.push(i);
                lastVal = currVal;
                bars[i].classList.add('bar-swap'); // Mark as part of strand
            } else {
                bars[i].classList.remove('bar-compare');
            }
        }

        // Now 'strandIndices' contains indices of the strand.
        // We need to bring these elements to the front (after sortedCount) and then merge them?
        // Actually, Strand sort merges the strand into the result.
        // Since the result is at the start (0 to sortedCount-1), we can merge the strand into it.
        // But the strand is scattered. 

        // Easier approach for visualization:
        // Compact the strand to be contiguous after the sorted part.
        // Then merge the two blocks [0..sortedCount-1] and [sortedCount..sortedCount+strandLen-1].

        // Move strand elements to the front of unsorted area
        let insertPos = sortedCount;


        // Let's try a simpler simulation:
        // We just move the strand elements to the 'sortedCount' position one by one
        // effectively compacting them.

        // To handle indices shifting, we process strandIndices carefully?
        // Actually, let's just implement a robust way:
        // We marked them with 'bar-swap'.
        // We iterate through the array, if we find a marked one, we bubble it down to the correct position?
        // No, that destroys the strand order if not careful.

        // Let's take the strand elements out logically, shift everything else right, then put them back?
        // Visualizer approach:
        // 1. Identify strand.
        // 2. Remove them (visually hide?) -> No.
        // 3. Shift non-strand items to right.
        // 4. Place strand items at [sortedCount...].
        // 5. Merge [0...sortedCount-1] and [sortedCount...sortedCount+strandLen].

        // Valid simplification:
        // Just extract the strand and place it immediately after the sorted section?
        // BUT the strand is ALREADY sorted.
        // AND the sorted prefix is ALREADY sorted.
        // So we just need to merge two sorted blocks.

        // Step A: Compact the strand.
        // We iterate through the array. If an element is part of the strand, we move it to the 'target' index.
        // We need to use valid swaps to move it.

        // We know the strand indices.
        // Let's move them one by one to `sortedCount + k`.

        let removedCount = 0;
        // We must re-scan because indices shift if we do swaps.
        // Actually, we can just bubble them to their target positions.

        // Re-identification is safer for loop correctness.
        // The strand is defined by the greedy increasing subsequence starting at sortedCount.

        // Let's implement the extraction:
        // Identify again
        let strand = [];
        let searchStart = sortedCount;
        let p = searchStart;
        if (p >= n) break; // done

        let tailHeight = parseInt(bars[p].style.height);
        strand.push({ idx: p, height: tailHeight });
        bars[p].classList.add('bar-swap'); // Highlight strand

        for (let i = p + 1; i < n; i++) {
            let h = parseInt(bars[i].style.height);
            if (h >= tailHeight) {
                strand.push({ idx: i, height: h });
                tailHeight = h;
                bars[i].classList.add('bar-swap');
            }
        }

        await sleep(getDelay());

        // Compact them: move all strand checks to [sortedCount ... sortedCount + strand.length - 1]
        // We can do this by shifting non-strand items.
        // For every item in strand (from first to last), swap it towards the left until it hits the barrier (sortedCount + localIndex).

        let placedCount = 0;
        for (let k = 0; k < strand.length; k++) {
            // Find where this element is NOW (it might have moved if we swapped things before it?)
            // Actually, if we process from left to right, the later elements' indices are only affected if we swap something PAST them?
            // No, we swap elements FROM the right TO the left.
            // The item at strand[k].idx needs to move to sortedCount + k.

            // To find it easily, let's just look for the class 'bar-swap' starting from sortedCount+placedCount.
            let currentIdx = -1;
            for (let scan = sortedCount + placedCount; scan < n; scan++) {
                if (bars[scan].classList.contains('bar-swap')) {
                    currentIdx = scan;
                    break;
                }
            }

            // Move bar at currentIdx to sortedCount + placedCount via swaps
            let targetIdx = sortedCount + placedCount;
            while (currentIdx > targetIdx) {
                await swapBars(bars[currentIdx], bars[currentIdx - 1]);

                // Track visual state manually since swapBars doesn't swap classList
                bars[currentIdx].classList.remove('bar-swap');
                bars[currentIdx - 1].classList.add('bar-swap');

                context.incrementSwap(); // counting swaps for movement
                currentIdx--;
            }
            placedCount++;
        }

        // Now the new strand is at [sortedCount, sortedCount + strand.length - 1].
        // And it is sorted.
        // And [0, sortedCount - 1] is sorted.
        // Merge these two sorted blocks.

        await timMerge(bars, 0, sortedCount - 1, sortedCount + strand.length - 1, context);

        sortedCount += strand.length;

        // Cleanup bar-swap classes for next round
        for (let i = 0; i < n; i++) bars[i].classList.remove('bar-swap');
    }

    // Final verify
    for (let i = 0; i < n; i++) bars[i].classList.add('bar-sorted');
}


// Radix Sort MSB Implementation
async function radixSortMSB(bars, context) {
    let maxVal = 0;
    for (let i = 0; i < bars.length; i++) {
        maxVal = Math.max(maxVal, parseInt(bars[i].style.height));
    }
    // Calculate max bits required. Max height is 100%, so 7 bits (2^7=128) is enough.
    // Or we can do decimal MSB. Let's do Decimal for visualization as it's more intuitive 
    // but typically MSB is binary. However, bars are 0-100. Let's do base 10 recursive.

    // Determining max power of 10
    let maxExp = 1;
    while (Math.floor(maxVal / maxExp) >= 10) {
        maxExp *= 10;
    }

    await radixMSBRecursive(bars, 0, bars.length - 1, maxExp, context);

    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function radixMSBRecursive(bars, start, end, exp, context) {
    if (start >= end || exp < 1) return;

    // Use buckets for stability or in-place partition?
    // In-place MSB is essentially American Flag sort or similar.
    // To keep it distinct from American Flag, let's just make this a stable recursive bucket verification?
    // Or just a standard MSB exchange.
    // Let's implement a Bucket-like distribution for this step using an auxiliary array (Stable).
    // Note: Visualizing auxiliary array is tricky with 'bars' references. 
    // We will do a counting-sort like pass but strictly for the current digit 'exp'.

    // 1. Count frequencies
    let count = new Array(10).fill(0);
    for (let i = start; i <= end; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay() / 2);

        let val = parseInt(bars[i].style.height);
        let digit = Math.floor(val / exp) % 10;
        count[digit]++;

        bars[i].classList.remove('bar-compare');
    }

    // 2. Compute starting indices
    let startIdx = new Array(10).fill(0);
    // Local start offsets relative to 'start'
    startIdx[0] = 0;
    for (let i = 1; i < 10; i++) {
        startIdx[i] = startIdx[i - 1] + count[i - 1];
    }

    // 3. Move elements
    // We need a temp buffer to hold values because swapping in-place for stable radix is hard.
    let buffer = new Array(end - start + 1);
    for (let i = start; i <= end; i++) {
        let val = parseInt(bars[i].style.height);
        let digit = Math.floor(val / exp) % 10;
        buffer[startIdx[digit]] = val;
        startIdx[digit]++;
    }

    // 4. Write back to bars
    for (let i = 0; i < buffer.length; i++) {
        let actualIdx = start + i;
        bars[actualIdx].classList.add('bar-swap');
        bars[actualIdx].style.height = `${buffer[i]}%`;
        playNote(200 + buffer[i] * 5, "square");
        context.incrementSwap(); // assignment
        await sleep(getDelay());
        bars[actualIdx].classList.remove('bar-swap');
    }

    // Recurse
    // We need to recover the start indices for recursion boundaries.
    // Recompute prefix sums
    let prefixSum = new Array(10).fill(0);
    prefixSum[0] = 0;
    for (let i = 1; i < 10; i++) {
        prefixSum[i] = prefixSum[i - 1] + count[i - 1];
    }

    for (let i = 0; i < 10; i++) {
        let s = start + prefixSum[i];
        let e = s + count[i] - 1;
        if (s < e) {
            await radixMSBRecursive(bars, s, e, Math.floor(exp / 10), context);
        }
    }
}

// Bucket Sort Implementation
async function bucketSort(bars, context) {
    const n = bars.length;
    if (n <= 0) return;

    // 1. Create buckets
    // We'll use 10 buckets for 0-9, 10-19, etc. since data is 0-100.
    const k = 10;
    let buckets = Array.from({ length: k }, () => []);

    // 2. Distribute
    for (let i = 0; i < n; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        let val = parseInt(bars[i].style.height);
        // Normalized bucket index. Max val is ~100.
        // val/100 * k ?  Assume val is 0-100.
        let bIdx = Math.floor((val / 100) * k);
        if (bIdx >= k) bIdx = k - 1;

        buckets[bIdx].push(val);

        // Visualize: maybe color it based on bucket?
        bars[i].style.backgroundColor = getBucketColor(bIdx, k);

        context.incrementComparison(); // Checking value
        bars[i].classList.remove('bar-compare');
    }

    await sleep(getDelay() * 2);

    // 3. Sort Buckets and Merge back
    let index = 0;
    for (let i = 0; i < k; i++) {
        // We'll assume these individual bucket sorts happen "internally" or we visualize placement
        // Let's sort the bucket using a simple sort (native JS sort for simplicity of code, 
        // but we should visualize the placement).
        buckets[i].sort((a, b) => a - b);

        for (let j = 0; j < buckets[i].length; j++) {
            bars[index].classList.add('bar-swap');
            bars[index].style.height = `${buckets[i][j]}%`;
            // Reset color
            if (document.getElementById("rainbow-toggle").checked) {
                const hue = Math.floor((buckets[i][j] / 100) * 360);
                bars[index].style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
            } else {
                bars[index].style.backgroundColor = '';
            }

            playNote(200 + buckets[i][j] * 5, "square");
            context.incrementSwap();
            await sleep(getDelay());
            bars[index].classList.remove('bar-swap');
            index++;
        }
    }

    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

function getBucketColor(idx, total) {
    const hue = Math.floor((idx / total) * 360);
    return `hsl(${hue}, 70%, 60%)`;
}


// Counting Sort Implementation
async function countingSort(bars, context) {
    const n = bars.length;
    if (n === 0) return;

    let maxVal = 0;
    for (let i = 0; i < n; i++) {
        maxVal = Math.max(maxVal, parseInt(bars[i].style.height));
    }

    let count = new Array(maxVal + 1).fill(0);

    // Count Value Visualization
    for (let i = 0; i < n; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay() / 2);

        let val = parseInt(bars[i].style.height);
        count[val]++;
        context.incrementComparison(); // Register scan

        bars[i].classList.remove('bar-compare');
    }

    // Reconstruct
    let index = 0;
    for (let i = 0; i <= maxVal; i++) {
        while (count[i] > 0) {
            bars[index].classList.add('bar-swap');
            bars[index].style.height = `${i}%`;
            playNote(200 + i * 5, "square");

            // Re-apply rainbow if needed
            if (document.getElementById("rainbow-toggle").checked) {
                const hue = Math.floor((i / 100) * 360);
                bars[index].style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
            }

            context.incrementSwap();
            await sleep(getDelay());

            bars[index].classList.remove('bar-swap');
            index++;
            count[i]--;
        }
    }
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

// Flash Sort Implementation
async function flashSort(bars, context) {
    const n = bars.length;
    if (n === 0) return;

    // 1. Classification
    // Find min and max
    let minVal = parseInt(bars[0].style.height);
    let maxIdx = 0;

    for (let i = 0; i < n; i++) {
        bars[i].classList.add('bar-compare');
        let val = parseInt(bars[i].style.height);
        if (val < minVal) minVal = val;
        if (val > parseInt(bars[maxIdx].style.height)) maxIdx = i;
        await sleep(getDelay() / 4);
        bars[i].classList.remove('bar-compare');
    }

    let maxVal = parseInt(bars[maxIdx].style.height);

    if (maxVal === minVal) {
        for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
        return;
    }

    // Number of classes/buckets (m) using roughly 0.43 * n
    let m = Math.floor(0.43 * n);
    if (m < 2) m = 2;

    let l = new Array(m).fill(0);

    // Count class sizes
    const c1 = (m - 1) / (maxVal - minVal);

    for (let i = 0; i < n; i++) {
        let val = parseInt(bars[i].style.height);
        let k = Math.floor(c1 * (val - minVal));
        l[k]++;
        context.incrementComparison();
    }

    // Accumulate (prefix sum) -> simplified Logic to get upper bounds
    for (let k = 1; k < m; k++) {
        l[k] += l[k - 1];
    }

    // 2. Permutation (Cyclic Shift)
    // Swap max to start
    await swapBars(bars[0], bars[maxIdx]);
    context.incrementSwap();

    let move = 0;
    let j = 0;
    let k = m - 1;

    while (move < n - 1) {
        while (j > l[k] - 1) {
            j++;
            let val = parseInt(bars[j].style.height);
            k = Math.floor(c1 * (val - minVal));
        }

        let flash = bars[j]; // The item we are holding
        // Ideally we follow cyclic logic.
        // We look at where flash belongs.
        // The implementation on arrays usually tracks 'flash' value and index.
        // Here we operate on DOM.

        // Find class of current bars[j]
        let val = parseInt(bars[j].style.height);
        k = Math.floor(c1 * (val - minVal));

        while (j !== l[k]) { // While not at correct top location
            k = Math.floor(c1 * (parseInt(bars[j].style.height) - minVal));
            let targetIdx = l[k] - 1;

            bars[j].classList.add('bar-swap');
            bars[targetIdx].classList.add('bar-swap');
            playNote(200 + parseInt(bars[targetIdx].style.height) * 5, "square");

            await swapBars(bars[j], bars[targetIdx]);
            context.incrementSwap();

            bars[j].classList.remove('bar-swap');
            bars[targetIdx].classList.remove('bar-swap');

            l[k]--; // Decrement pointer for this class
            move++;

            // After swap, bars[j] has a new value, we compute k again in loop condition
        }
    }

    // 3. Insertion Sort on resulting array
    await insertionSort(bars, context);
    // Flash sort ends with insertion sort for cleanup
}

// American Flag Sort Implementation
// Optimized Radix (In-place)
async function americanFlagSort(bars, context) {
    let maxVal = 0;
    for (let i = 0; i < bars.length; i++) {
        let val = parseInt(bars[i].style.height);
        if (val > maxVal) maxVal = val;
    }

    // Calculate max divisor (largest power of 10 <= maxVal)
    let maxDivisor = 1;
    while (Math.floor(maxVal / maxDivisor) >= 10) maxDivisor *= 10;

    await americanFlagSortRecursive(bars, 0, bars.length - 1, maxDivisor, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function americanFlagSortRecursive(bars, start, end, divisor, context) {
    if (start >= end || divisor < 1) return;

    let count = new Array(10).fill(0);
    let offset = new Array(10).fill(0);

    // Count
    for (let i = start; i <= end; i++) {
        let val = parseInt(bars[i].style.height);
        let digit = Math.floor(val / divisor) % 10;
        count[digit]++;
    }

    offset[0] = start;
    let computedStart = new Array(10); // Save for recursion
    computedStart[0] = start;

    for (let k = 1; k < 10; k++) {
        offset[k] = offset[k - 1] + count[k - 1];
        computedStart[k] = offset[k];
    }

    // In-place distribution
    for (let b = 0; b < 10; b++) {
        while (count[b] > 0) {
            let origin = offset[b];
            let val = parseInt(bars[origin].style.height);
            let digit = Math.floor(val / divisor) % 10;

            if (digit === b) {
                offset[b]++;
                count[b]--;
            } else {
                let target = offset[digit];

                bars[origin].classList.add('bar-swap');
                bars[target].classList.add('bar-swap');
                playNote(200 + parseInt(bars[target].style.height) * 5, "square");

                await swapBars(bars[origin], bars[target]);
                context.incrementSwap();

                bars[origin].classList.remove('bar-swap');
                bars[target].classList.remove('bar-swap');

                offset[digit]++;
                count[digit]--;
                await sleep(getDelay());
            }
        }
    }

    // Recursive calls
    for (let i = 0; i < 10; i++) {
        // e is computedStart[i?] No.
        // range for digit i is [computedStart[i], computedStart[i] + originally_counted[i] - 1]
        // But we lost original count? No, we used count[b] to 0. 
        // We can recover or just use computedStart[i] to computedStart[i+1]-1
        let s = computedStart[i];
        let e = (i === 9) ? end : computedStart[i + 1] - 1;
        if (s < e) {
            await americanFlagSortRecursive(bars, s, e, Math.floor(divisor / 10), context);
        }
    }
}

// --- Menu Toggle Logic ---

{
    const menuToggle = document.getElementById('menu-toggle');
    const menuClose = document.getElementById('menu-close');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsOverlay = document.getElementById('settings-overlay');

    const openMenu = () => {
        if (settingsPanel) settingsPanel.classList.add('active');
        if (settingsOverlay) settingsOverlay.classList.add('active');
    };

    const closeMenu = () => {
        if (settingsPanel) settingsPanel.classList.remove('active');
        if (settingsOverlay) settingsOverlay.classList.remove('active');
    };

    if (menuToggle) menuToggle.addEventListener('click', openMenu);
    if (menuClose) menuClose.addEventListener('click', closeMenu);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeMenu);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsPanel && settingsPanel.classList.contains('active')) {
            closeMenu();
        }
    });
}

// --- New Algorithms ---

// Quadsort Implementation (Visualizer-friendly 4-way merge sort)
async function quadSort(bars, context) {
    await quadSortRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function quadSortRecursive(bars, start, end, context) {
    if (start >= end) return;

    const len = end - start + 1;
    if (len < 4) {
        await insertionSortRange(bars, start, end, context);
        return;
    }

    const q1 = Math.floor(len / 4);
    const q2 = Math.floor(len / 2);
    const q3 = Math.floor(3 * len / 4);

    const mid1 = start + q1;
    const mid2 = start + q2;
    const mid3 = start + q3;

    await quadSortRecursive(bars, start, mid1 - 1, context);
    await quadSortRecursive(bars, mid1, mid2 - 1, context);
    await quadSortRecursive(bars, mid2, mid3 - 1, context);
    await quadSortRecursive(bars, mid3, end, context);

    await quadMerge(bars, start, mid1, mid2, mid3, end, context);
}

// Helper for Quadsort
async function insertionSortRange(bars, start, end, context) {
    for (let i = start + 1; i <= end; i++) {
        let j = i;
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        await sleep(getDelay());

        while (j > start) {
            bars[j].classList.add('bar-compare');
            bars[j - 1].classList.add('bar-compare');
            context.incrementComparison();

            if (parseInt(bars[j - 1].style.height) > parseInt(bars[j].style.height)) {
                await swapBars(bars[j], bars[j - 1]);
                context.incrementSwap();
                bars[j].classList.remove('bar-compare');
                bars[j - 1].classList.remove('bar-compare');
                j--;
            } else {
                bars[j].classList.remove('bar-compare');
                bars[j - 1].classList.remove('bar-compare');
                break;
            }
        }
        bars[i].classList.remove('bar-compare');
    }
}

async function quadMerge(bars, start, mid1, mid2, mid3, end, context) {
    // 4-way merge visualized as iterative merges or just sequential standard merges
    // ((A+B) + (C+D))
    await merge(bars, start, mid1 - 1, mid2 - 1, context);
    await merge(bars, mid2, mid3 - 1, end, context);
    await merge(bars, start, mid2 - 1, end, context);
}

// Fluxsort Implementation (Stable Quicksort approximation)
async function fluxSort(bars, context) {
    await fluxSortRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function fluxSortRecursive(bars, low, high, context) {
    if (low >= high) return;

    // Stable Partition returns boundaries of the Equal range
    const [eqStart, eqEnd] = await fluxPartition(bars, low, high, context);

    await fluxSortRecursive(bars, low, eqStart - 1, context);
    await fluxSortRecursive(bars, eqEnd + 1, high, context);
}

async function fluxPartition(bars, low, high, context) {
    const mid = Math.floor((low + high) / 2);
    const pivotVal = parseInt(bars[mid].style.height);
    bars[mid].classList.add('bar-compare'); // Mark pivot

    let leftList = [];
    let equalList = [];
    let rightList = [];

    // 1. Buffer phase
    for (let i = low; i <= high; i++) {
        bars[i].classList.add('bar-compare');
        playNote(200 + parseInt(bars[i].style.height) * 5);
        if (getDelay() > 0) await sleep(getDelay() / 4);

        const val = parseInt(bars[i].style.height);
        const hStr = bars[i].style.height;
        context.incrementComparison();

        if (val < pivotVal) leftList.push(hStr);
        else if (val === pivotVal) equalList.push(hStr);
        else rightList.push(hStr);

        bars[i].classList.remove('bar-compare');
    }

    // 2. Write back phase
    let k = low;
    const all = [...leftList, ...equalList, ...rightList];

    for (let i = 0; i < all.length; i++) {
        // Only swap/write if different to save operations if already in place?
        // But for visualizer, we want to show the 'flux' of rewriting.
        // If we write same value, it's cheap.
        bars[k].classList.add('bar-swap');
        bars[k].style.height = all[i];
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        context.incrementSwap(); // assignment count
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
    }

    const eqStart = low + leftList.length;
    const eqEnd = eqStart + equalList.length - 1;

    return [eqStart, eqEnd];
}

// Wolfsort Implementation (Adaptive Merge Sort)
async function wolfSort(bars, context) {
    let runs = [];
    let start = 0;
    const len = bars.length;

    if (len < 2) return;

    // 1. Scan for Runs
    while (start < len) {
        let end = start;
        let ascending = true;

        // Find run length
        while (end < len - 1) {
            const val = parseInt(bars[end].style.height);
            const nextVal = parseInt(bars[end + 1].style.height);

            if (end === start) {
                if (val > nextVal) ascending = false;
            } else {
                if (ascending && val > nextVal) break;
                if (!ascending && val < nextVal) break;
            }

            bars[end].classList.add('bar-compare');
            await sleep(getDelay() / 2);
            bars[end].classList.remove('bar-compare');
            end++;
        }
        bars[end].classList.add('bar-compare');
        await sleep(getDelay() / 2);
        bars[end].classList.remove('bar-compare');

        if (!ascending) {
            await reverseRange(bars, start, end, context);
        }

        runs.push({ start, end });
        start = end + 1;
    }

    // 2. Merge Runs
    while (runs.length > 1) {
        let newRuns = [];
        for (let i = 0; i < runs.length; i += 2) {
            if (i + 1 < runs.length) {
                const runA = runs[i];
                const runB = runs[i + 1];
                await merge(bars, runA.start, runA.end, runB.end, context);
                newRuns.push({ start: runA.start, end: runB.end });
            } else {
                newRuns.push(runs[i]);
            }
        }
        runs = newRuns;
    }

    for (let i = 0; i < len; i++) bars[i].classList.add('bar-sorted');
}

async function reverseRange(bars, start, end, context) {
    let i = start, j = end;
    while (i < j) {
        bars[i].classList.add('bar-swap');
        bars[j].classList.add('bar-swap');
        playNote(200 + parseInt(bars[i].style.height) * 5, "square");

        await swapBars(bars[i], bars[j]);
        context.incrementSwap();

        bars[i].classList.remove('bar-swap');
        bars[j].classList.remove('bar-swap');
        i++;
        j--;
    }
}

// Powersort Implementation (Simulated Run-based Merge)
async function powerSort(bars, context) {
    // Powersort optimizes merge order. We'll simulate by finding runs then merging.
    // Similar to Wolfsort but without the explicit "Ascending/Descending" reversals (simplified for visual distinction if desired, but Powersort is also adaptive).
    // To distinguish: We'll implement a slightly different run detector or correct "Node Power" logic is too complex for visualizer in 1 file.
    // We will use standard natural merge sort logic.

    let runs = [];
    let start = 0;
    const len = bars.length;

    while (start < len) {
        let end = start;
        // Find strictly ascending runs
        while (end < len - 1) {
            bars[end].classList.add('bar-compare');
            await sleep(getDelay() / 4);
            bars[end].classList.remove('bar-compare');

            const val = parseInt(bars[end].style.height);
            const nextVal = parseInt(bars[end + 1].style.height);
            if (val > nextVal) break;
            end++;
        }
        runs.push({ start, end });
        start = end + 1;
    }

    // Merge Strategy: Merge adjacent runs.
    while (runs.length > 1) {
        let newRuns = [];
        for (let i = 0; i < runs.length; i += 2) {
            if (i + 1 < runs.length) {
                const runA = runs[i];
                const runB = runs[i + 1];
                await merge(bars, runA.start, runA.end, runB.end, context);
                newRuns.push({ start: runA.start, end: runB.end });
            } else {
                newRuns.push(runs[i]);
            }
        }
        runs = newRuns;
    }
    for (let i = 0; i < len; i++) bars[i].classList.add('bar-sorted');
}

// PDQSort Implementation (Pattern-Defeating Quicksort)
async function pdqSort(bars, context) {
    await pdqSortRecursive(bars, 0, bars.length - 1, context);
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function pdqSortRecursive(bars, begin, end, context) {
    if (begin >= end) return;

    // 1. Insertion Sort for small arrays
    if (end - begin < 12) {
        await insertionSortRange(bars, begin, end, context);
        return;
    }

    // 2. Check for sorted (Pattern Defeating)
    let sorted = true;
    for (let i = begin; i < end; i++) {
        if (parseInt(bars[i].style.height) > parseInt(bars[i + 1].style.height)) {
            sorted = false; break;
        }
    }
    if (sorted) return;

    // 3. Partition
    // For PDQ, we'd normally shuffle if bad pivot, but here we just partition.
    const pivotIdx = await partition(bars, begin, end, context); // Reuse standard Lomuto partition

    await pdqSortRecursive(bars, begin, pivotIdx - 1, context);
    await pdqSortRecursive(bars, pivotIdx + 1, end, context);
}
