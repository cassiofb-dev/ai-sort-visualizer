const visualizerGrid = document.getElementById("visualizer-grid");
const generateBtn = document.getElementById("generate-btn");
const sortBtn = document.getElementById("sort-btn");
const arraySizeInput = document.getElementById("array-size");
const speedInput = document.getElementById("speed");
const soundToggle = document.getElementById("sound-toggle");
const algorithmSelect = document.getElementById("algorithm-select");

// Global State
let activeVisualizers = [];
let isSorting = false;
let currentBaseArray = []; // Stores the raw numbers so every algo gets the same data

class SortVisualizer {
    constructor(algoId, algoName) {
        this.algoId = algoId;
        this.algoName = algoName;
        this.comparisons = 0;
        this.swaps = 0;
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

            this.containerInfo.barContainer.appendChild(bar);
            this.bars.push(bar);
        });

        this.comparisons = 0;
        this.swaps = 0;
        this.updateStatsUI();
    }

    incrementComparison() {
        this.comparisons++;
        this.updateStatsUI();
    }

    incrementSwap() {
        this.swaps++;
        this.updateStatsUI();
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

    // Lower volume if multiple visualizers are running
    const vol = activeVisualizers.length > 1 ? 0.05 : 0.1;

    // Short beep
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);

    osc.stop(audioCtx.currentTime + 0.1);
}

// Old global array/sorting/speed variables removed

// Helper to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get speed delay based on slider (inverted so higher slider = faster)
const getDelay = () => {
    // 100 - speed. 100 -> 0ms, 1 -> 100ms. 
    // Let's map it better: 
    // Slider 1-100. 
    // Speed 100 -> 5ms
    // Speed 1 -> 500ms
    const val = parseInt(speedInput.value);
    return Math.floor(500 - (val * 4.95));
};

// Swap Animation Helper
async function swapBars(bar1, bar2) {
    // 1. Calculate distance
    const rect1 = bar1.getBoundingClientRect();
    const rect2 = bar2.getBoundingClientRect();
    const distance = rect2.left - rect1.left;

    // 2. Animate Transform
    // We want bar1 to move to bar2, and bar2 to move to bar1
    bar1.style.transform = `translateX(${distance}px)`;
    bar2.style.transform = `translateX(${-distance}px)`;

    // Wait for animation
    await sleep(getDelay());

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

// Event Listeners
generateBtn.addEventListener("click", generateArray);
arraySizeInput.addEventListener("input", generateArray);
// When algorithm selection changes, we don't necessarily regenerate IMMEDIATELY if we want to keep data,
// but for simplicity, let's regenerate to update the view.
algorithmSelect.addEventListener("change", generateArray);
sortBtn.addEventListener("click", () => {
    initAudio(); // Initialize audio context on user interaction
    startSort();
});

const startSort = async () => {
    if (isSorting) return;
    if (activeVisualizers.length === 0) generateArray(); // ensure we have something

    toggleControls(true);

    // Create promises for all active visualizers
    const promises = activeVisualizers.map(viz => {
        const algo = viz.algoId;
        const bars = viz.bars;
        // Bind methods to the visualizer instance so we don't assume global 'this' or similar issues
        const context = viz;

        if (algo === "bubble") return bubbleSort(bars, context);
        else if (algo === "selection") return selectionSort(bars, context);
        else if (algo === "insertion") return insertionSort(bars, context);
        else if (algo === "merge") return mergeSort(bars, context);
        else if (algo === "quick") return quickSort(bars, context);
        else if (algo === "heap") return heapSort(bars, context);
        else if (algo === "shell") return shellSort(bars, context);
        else if (algo === "cocktail") return cocktailShakerSort(bars, context);
        else if (algo === "comb") return combSort(bars, context);
        else if (algo === "gnome") return gnomeSort(bars, context);
        else if (algo === "cycle") return cycleSort(bars, context);
        else if (algo === "pancake") return pancakeSort(bars, context);
        else if (algo === "bitonic") return bitonicSort(bars, context);
        else if (algo === "radix") return radixSort(bars, context);
        else if (algo === "oddeven") return oddEvenSort(bars, context);
        else if (algo === "quick3") return quickSort3Way(bars, context);
        else if (algo === "stooge") return stoogeSort(bars, context);
        else if (algo === "stalin") return stalinSort(bars, context);
        else if (algo === "bogo") return bogoSort(bars, context);
        else if (algo === "bozo") return bozoSort(bars, context);
        else if (algo === "slow") return slowSort(bars, context);
        else if (algo === "double_selection") return doubleSelectionSort(bars, context);
    });

    await Promise.all(promises);

    toggleControls(false);
};


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

// Cycle Sort Implementation
async function cycleSort(bars, context) {
    // This is notoriously hard to visualize well in-place without overwriting logic getting complex
    // But we can implement the standard algorithm and highlight moves.
    const len = bars.length;

    for (let cycleStart = 0; cycleStart <= len - 2; cycleStart++) {
        let itemHeight = bars[cycleStart].style.height;
        let itemVal = parseInt(itemHeight);

        bars[cycleStart].classList.add('bar-compare'); // Item we are trying to place

        let pos = cycleStart;
        for (let i = cycleStart + 1; i < len; i++) {
            // Visual scan
            bars[i].classList.add('bar-compare');
            playNote(200 + parseInt(bars[i].style.height) * 5);
            await sleep(getDelay() / 2);

            context.incrementComparison();
            if (parseInt(bars[i].style.height) < itemVal) {
                pos++;
            }
            bars[i].classList.remove('bar-compare');
        }

        if (pos === cycleStart) {
            bars[cycleStart].classList.remove('bar-compare');
            bars[cycleStart].classList.add('bar-sorted'); // It's in correct place
            continue;
        }

        while (itemVal === parseInt(bars[pos].style.height)) {
            pos++;
        }

        // Write
        // Write
        if (pos !== cycleStart) {
            bars[pos].classList.add('bar-swap');
            bars[cycleStart].classList.add('bar-swap'); // Visually using cycleStart as source

            // Swap cycleStart (which holds itemHeight) with pos
            await swapBars(bars[cycleStart], bars[pos]);

            context.incrementSwap(); // Write
            playNote(200 + parseInt(bars[pos].style.height) * 5, "square");

            bars[pos].classList.remove('bar-swap');
            bars[cycleStart].classList.remove('bar-swap');

            itemHeight = bars[cycleStart].style.height;
            itemVal = parseInt(itemHeight);
        }

        while (pos !== cycleStart) {
            pos = cycleStart;
            // Find position again for new item
            for (let i = cycleStart + 1; i < len; i++) {
                context.incrementComparison();
                // No visual scan here to speed up, or maybe add if desired
                if (parseInt(bars[i].style.height) < itemVal) {
                    pos++;
                }
            }

            while (itemVal === parseInt(bars[pos].style.height)) {
                pos++;
            }

            if (itemVal !== parseInt(bars[pos].style.height)) {
                bars[pos].classList.add('bar-swap');
                bars[cycleStart].classList.add('bar-swap');

                await swapBars(bars[cycleStart], bars[pos]);

                context.incrementSwap();
                playNote(200 + parseInt(bars[pos].style.height) * 5, "square");

                bars[pos].classList.remove('bar-swap');
                bars[cycleStart].classList.remove('bar-swap');

                itemHeight = bars[cycleStart].style.height;
                itemVal = parseInt(itemHeight);
            }
        }
        bars[cycleStart].classList.remove('bar-compare');
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
