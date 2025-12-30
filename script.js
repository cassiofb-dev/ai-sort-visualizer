const container = document.getElementById("array-container");
const generateBtn = document.getElementById("generate-btn");
const sortBtn = document.getElementById("sort-btn");
const arraySizeInput = document.getElementById("array-size");
const speedInput = document.getElementById("speed");
const soundToggle = document.getElementById("sound-toggle");
const algorithmSelect = document.getElementById("algorithm-select");
const comparisonCountParams = document.getElementById("comparison-count");
const swapCountParams = document.getElementById("swap-count");

// Stats Variables
let comparisonCount = 0;
let swapCount = 0;

function updateStatsUI() {
    comparisonCountParams.innerText = comparisonCount;
    swapCountParams.innerText = swapCount;
}

function resetStats() {
    comparisonCount = 0;
    swapCount = 0;
    updateStatsUI();
}

function incrementComparison() {
    comparisonCount++;
    updateStatsUI();
}

function incrementSwap() {
    swapCount++;
    updateStatsUI();
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

    // Short beep
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);

    osc.stop(audioCtx.currentTime + 0.1);
}

let array = [];
let isSorting = false;
let sortingSpeed = 50;

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

// Generate random array
const generateArray = () => {
    if (isSorting) return;

    container.innerHTML = "";
    array = [];
    const size = parseInt(arraySizeInput.value);

    // We want bars to fit in the container width
    // container width approx 1160px max padding included
    // But flexbox handles it, we just need height %

    for (let i = 0; i < size; i++) {
        // Random height between 5 and 100
        const value = Math.floor(Math.random() * 95) + 5;
        array.push(value);

        const bar = document.createElement("div");
        bar.classList.add("array-bar");
        bar.style.height = `${value}%`;
        // Dynamic width based on size
        const width = Math.max(2, Math.floor(1000 / size) - 2);
        bar.style.width = `${width}px`;
        container.appendChild(bar);
    }
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
sortBtn.addEventListener("click", () => {
    initAudio(); // Initialize audio context on user interaction
    startSort();
});

const startSort = async () => {
    if (isSorting) return;
    toggleControls(true);
    resetStats();

    const algo = algorithmSelect.value;
    const bars = document.getElementsByClassName("array-bar");

    if (algo === "bubble") await bubbleSort(bars);
    else if (algo === "selection") await selectionSort(bars);
    else if (algo === "insertion") await insertionSort(bars);
    else if (algo === "merge") await mergeSort(bars);
    else if (algo === "quick") await quickSort(bars);

    toggleControls(false);
};


// Algorithm Placeholders
// Bubble Sort Implementation
async function bubbleSort(bars) {
    const len = bars.length;
    for (let i = 0; i < len - 1; i++) {
        for (let j = 0; j < len - i - 1; j++) {
            bars[j].classList.add('bar-compare');
            bars[j + 1].classList.add('bar-compare');
            playNote(200 + parseInt(bars[j].style.height) * 5); // Compare sound
            await sleep(getDelay());

            const h1 = parseInt(bars[j].style.height);
            const h2 = parseInt(bars[j + 1].style.height);

            incrementComparison();
            if (h1 > h2) {
                bars[j].classList.replace('bar-compare', 'bar-swap');
                bars[j + 1].classList.replace('bar-compare', 'bar-swap');
                playNote(200 + h1 * 5, "square"); // Swap sound
                await sleep(getDelay());

                bars[j].style.height = `${h2}%`;
                bars[j + 1].style.height = `${h1}%`;
                incrementSwap();
                await sleep(getDelay());

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
async function selectionSort(bars) {
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

            incrementComparison();
            if (h1 < h2) {
                if (minIdx !== i) bars[minIdx].classList.remove('bar-swap');
                minIdx = j;
                bars[minIdx].classList.add('bar-swap');
            } else {
                bars[j].classList.remove('bar-compare');
            }
        }

        if (minIdx !== i) {
            const h1 = bars[i].style.height;
            const h2 = bars[minIdx].style.height;

            bars[i].style.height = h2;
            bars[minIdx].style.height = h1;
            incrementSwap();
            await sleep(getDelay());

            bars[minIdx].classList.remove('bar-swap');
            playNote(200 + parseInt(bars[i].style.height) * 5, "square");
            bars[minIdx].classList.remove('bar-compare');
        }

        bars[i].classList.remove('bar-compare');
        bars[i].classList.add('bar-sorted');
    }
}

// Insertion Sort Implementation
async function insertionSort(bars) {
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

            incrementComparison();
            if (hPrev > hCurr) {
                playNote(200 + hCurr * 5, "square");
                // Swap visual
                bars[j].style.height = bars[j - 1].style.height;
                bars[j - 1].style.height = height; // technically we swap bubbling down
                incrementSwap();

                await sleep(getDelay());

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
async function mergeSort(bars) {
    await mergeSortRecursive(bars, 0, bars.length - 1);
}

async function mergeSortRecursive(bars, start, end) {
    if (start >= end) return;

    const mid = Math.floor((start + end) / 2);
    await mergeSortRecursive(bars, start, mid);
    await mergeSortRecursive(bars, mid + 1, end);
    await merge(bars, start, mid, end);
}

async function merge(bars, start, mid, end) {
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

        incrementComparison();
        if (h1 <= h2) {
            bars[k].style.height = leftArr[i];
            i++;
        } else {
            bars[k].style.height = rightArr[j];
            j++;
        }

        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        incrementSwap();
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        k++;
    }

    while (i < leftArr.length) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = leftArr[i];
        incrementSwap(); // assignment
        playNote(200 + parseInt(bars[k].style.height) * 5, "square");
        await sleep(getDelay());
        bars[k].classList.remove('bar-swap');
        i++;
        k++;
    }

    while (j < rightArr.length) {
        bars[k].classList.add('bar-swap');
        bars[k].style.height = rightArr[j];
        incrementSwap(); // assignment
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
async function quickSort(bars) {
    await quickSortRecursive(bars, 0, bars.length - 1);
    // Final verification color
    for (let i = 0; i < bars.length; i++) bars[i].classList.add('bar-sorted');
}

async function quickSortRecursive(bars, low, high) {
    if (low < high) {
        const pi = await partition(bars, low, high);
        await quickSortRecursive(bars, low, pi - 1);
        await quickSortRecursive(bars, pi + 1, high);
    }
}

async function partition(bars, low, high) {
    const pivot = parseInt(bars[high].style.height);
    bars[high].classList.add('bar-compare'); // pivot color

    let i = low - 1;

    for (let j = low; j < high; j++) {
        bars[j].classList.add('bar-compare');
        playNote(200 + parseInt(bars[j].style.height) * 5);
        await sleep(getDelay());

        const currentHeight = parseInt(bars[j].style.height);

        incrementComparison();
        if (currentHeight < pivot) {
            i++;
            // swap i and j
            const temp = bars[i].style.height;
            bars[i].style.height = bars[j].style.height;
            bars[j].style.height = temp;

            incrementSwap();

            bars[i].classList.add('bar-swap');
            bars[j].classList.add('bar-swap');
            playNote(200 + parseInt(bars[i].style.height) * 5, "square");
            await sleep(getDelay());
            bars[i].classList.remove('bar-swap');
            bars[j].classList.remove('bar-swap');
        }
        bars[j].classList.remove('bar-compare');
    }

    // Swap i+1 and pivot (high)
    const temp = bars[i + 1].style.height;
    bars[i + 1].style.height = bars[high].style.height;
    bars[high].style.height = temp;
    incrementSwap();

    bars[high].classList.remove('bar-compare');

    return i + 1;
}

// Initialize
generateArray();
