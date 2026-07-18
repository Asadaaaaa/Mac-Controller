// DOM Elements
const volumeSlider = document.getElementById('volumeSlider');
const volumeDisplay = document.getElementById('volumeDisplay');
const sliderFill = document.getElementById('sliderFill');
const muteBtn = document.getElementById('muteBtn');
const muteBtnText = document.getElementById('muteBtnText');
const muteIcon = document.getElementById('muteIcon');
const refreshBtn = document.getElementById('refreshBtn');
const statusElement = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');
const touchpad = document.getElementById('touchpad');
// const leftClickBtn = document.getElementById('leftClick'); // Removed
// const rightClickBtn = document.getElementById('rightClick'); // Removed
const touchpadSection = document.getElementById('touchpadSection');
const lockBtn = document.getElementById('lockBtn');
const lockScreen = document.getElementById('lockScreen');
const unlockThumb = document.getElementById('unlockThumb');
const unlockTrack = document.querySelector('.unlock-track');
const pinScreen = document.getElementById('pinScreen');
const pinInput = document.getElementById('pinInput');
const connectBtn = document.getElementById('connectBtn');
const pinError = document.getElementById('pinError');
const keyboardBtn = document.getElementById('keyboardBtn');
const hiddenInput = document.getElementById('hiddenInput');
const screenToggle = document.getElementById('screenToggle');
const screenStream = document.getElementById('screenStream');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
const remoteCursor = document.getElementById('remoteCursor');
const resolutionSelect = document.getElementById('resolutionSelect');
const gyroToggle = document.getElementById('gyroToggle');
const gyroSensitivitySelect = document.getElementById('gyroSensitivitySelect');

// Watch tab elements
const watchStream = document.getElementById('watchStream');
const watchContainer = document.getElementById('watchContainer');
const watchPlaceholder = document.getElementById('watchPlaceholder');
const watchAudioIndicator = document.getElementById('watchAudioIndicator');
const watchResolutionSelect = document.getElementById('watchResolutionSelect');
const watchFullscreenBtn = document.getElementById('watchFullscreenBtn');
const watchExitFullscreenBtn = document.getElementById('watchExitFullscreenBtn');

// State
let currentVolume = 50;
let isMuted = false;
let isUpdating = false;
let ws = null;
let reconnectTimeout = null;

// Touchpad state
let isDragging = false;
let lastX = 0;
let lastY = 0;
let lastX2 = 0;
let lastY2 = 0;
let scrollAccumulatorX = 0;
let scrollAccumulatorY = 0;
const sensitivity = 1.5; // Cursor movement sensitivity

// Local cursor tracking state
let localMouseX = 0;
let localMouseY = 0;
let serverScreenW = 1920;
let serverScreenH = 1080;

// Gesture State
let touchStartTime = 0;
let isTap = false;
let touchStartX = 0;
let touchStartY = 0;
const TAP_THRESHOLD = 10; // Max movement for a tap
const TAP_DURATION = 250; // Max duration for a tap

// Double-tap and Drag/Click Gesture State
let isDoubleTapDraggingCandidate = false;
let isDoubleTapDragging = false;
let clickTimeout = null;

// Desktop Mouse simulation states
let lastMouseUpTime = 0;
let isMouseDoubleDragCandidate = false;
let isMouseDoubleDragging = false;
let mouseStartX = 0;
let mouseStartY = 0;

// Lock Screen State
let isLocked = false;
let isUnlockDragging = false;
let unlockStartX = 0;
let unlockThumbWidth = 0;
let unlockTrackWidth = 0;
let maxDrag = 0;

// Gyroscope / Air Mouse State
let isGyroActive = false;
let lastBeta = null;
let lastGamma = null;
let gyroSensitivity = 1.0;
let smoothX = 0;
let smoothY = 0;
let velocityX = 0;
let velocityY = 0;

// Watch mode state
let isWatchActive = false;
let audioContext = null;
let audioSourceBuffer = [];
let activeTab = 'touchpad';
let watchParent = null;
let watchSibling = null;

// Auth State
let isAuthenticated = false;
let accessToken = null;
let refreshToken = null;
let refreshTimer = null;

// Haptic Feedback
function triggerHaptic(pattern = [10]) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        showSuccess();
        clearTimeout(reconnectTimeout);

        // Try to restore session
        const storedRefreshToken = localStorage.getItem('refreshToken');
        if (storedRefreshToken) {
            console.log('🔄 Restoring session...');
            sendWebSocketMessage('refreshToken', { refreshToken: storedRefreshToken });
        }
    };

    ws.onmessage = (event) => {
        try {
            if (typeof event.data === 'string') {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } else if (event.data instanceof ArrayBuffer) {
                // Check if it's audio (0x01 prefix) or video (raw JPEG)
                if (isWatchActive) {
                    const view = new Uint8Array(event.data);
                    if (view[0] === 0x01) {
                        // Audio chunk: strip prefix and play
                        handleAudioChunk(event.data.slice(1));
                    } else {
                        // Video frame: render on watch stream
                        const blob = new Blob([event.data], { type: 'image/jpeg' });
                        renderWatchFrame(blob);
                    }
                } else if (screenToggle.checked) {
                    // Touchpad mode: render directly as video frame
                    const blob = new Blob([event.data], { type: 'image/jpeg' });
                    renderTouchpadFrame(blob);
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('Connection error');
    };

    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        showError('Disconnected');
        disableGyroUI();
        // Attempt to reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connectWebSocket();
        }, 3000);
    };
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(data) {
    const { type, success } = data;

    if (!success && data.error) {
        console.error(`Error for ${type}:`, data.error);
        showError(data.error);
        return;
    }

    switch (type) {
        case 'connected':
            console.log('Server says:', data.message);
            // Don't refresh volume yet, wait for auth
            break;

        case 'verifyPin':
            if (success) {
                isAuthenticated = true;
                accessToken = data.accessToken;
                refreshToken = data.refreshToken;

                // Save to localStorage
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('refreshToken', refreshToken);

                pinScreen.classList.add('hidden');
                refreshVolume();
                triggerHaptic([50]);

                if (screenToggle.checked) {
                    const resolution = resolutionSelect.value || '720p';
                    sendWebSocketMessage('startScreenStream', { resolution });
                }

                // Start refresh timer (refresh every 4.5 minutes)
                startRefreshTimer();
            } else {
                pinError.textContent = data.error || 'Invalid PIN';
                pinError.classList.remove('hidden');
                triggerHaptic([50, 50, 50]); // Error vibration
                pinInput.value = '';
            }
            break;

        case 'refreshToken':
            if (success) {
                accessToken = data.accessToken;
                localStorage.setItem('accessToken', accessToken);

                // If we were restoring session, hide PIN screen now
                if (!isAuthenticated) {
                    isAuthenticated = true;
                    pinScreen.classList.add('hidden');
                    refreshVolume();
                    startRefreshTimer();
                }
                
                if (screenToggle.checked) {
                    const resolution = resolutionSelect.value || '720p';
                    sendWebSocketMessage('startScreenStream', { resolution });
                }
                
                console.log('🔄 Token refreshed');
            } else {
                console.error('Failed to refresh token:', data.error);
                handleLogout();
            }
            break;

        case 'getVolume':
            if (data.volume !== undefined) {
                currentVolume = data.volume;
                volumeSlider.value = data.volume;
                updateVolumeDisplay(data.volume);
            }
            break;

        case 'setVolume':
            if (data.volume !== undefined) {
                currentVolume = data.volume;
                updateVolumeDisplay(data.volume);
                showSuccess();
            }
            isUpdating = false;
            break;

        case 'getMute':
            if (data.muted !== undefined) {
                isMuted = data.muted;
                updateMuteButton(data.muted);
            }
            break;

        case 'setMute':
            if (data.muted !== undefined) {
                isMuted = data.muted;
                updateMuteButton(data.muted);
                showSuccess();
            }
            isUpdating = false;
            break;

        case 'pressArrow':
            if (success) {
                showSuccess();
            }
            break;

        case 'screenFrame':
            if (success && data.image && screenToggle.checked) {
                screenStream.src = `data:image/jpeg;base64,${data.image}`;
                if (screenStream.classList.contains('hidden')) {
                    screenStream.classList.remove('hidden');
                }

                // Overlay PC cursor
                if (data.mouse && data.screenSize) {
                    serverScreenW = data.screenSize.width;
                    serverScreenH = data.screenSize.height;
                    
                    // Only update with server coordinates if not currently dragging or using gyroscope
                    if (!isDragging && !isGyroActive) {
                        localMouseX = data.mouse.x;
                        localMouseY = data.mouse.y;
                    }
                    updateLocalCursorOverlay();
                } else {
                    remoteCursor.classList.add('hidden');
                }
            }
            break;
    }
}

// Send WebSocket message
function sendWebSocketMessage(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = { type, payload };
        if (accessToken) {
            message.token = accessToken;
        }
        ws.send(JSON.stringify(message));
    } else {
        showError('Not connected');
        console.error('WebSocket is not connected');
    }
}

// Start Refresh Timer
function startRefreshTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    // Refresh every 4.5 minutes (270000 ms)
    refreshTimer = setInterval(() => {
        if (refreshToken) {
            sendWebSocketMessage('refreshToken', { refreshToken });
        }
    }, 270000);
}

// Handle Logout
function handleLogout() {
    isAuthenticated = false;
    accessToken = null;
    refreshToken = null;
    if (refreshTimer) clearInterval(refreshTimer);

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    pinScreen.classList.remove('hidden');
    pinInput.value = '';
    showError('Session expired');
}

// Restore Session
function restoreSession() {
    const storedRefreshToken = localStorage.getItem('refreshToken');
    if (storedRefreshToken) {
        refreshToken = storedRefreshToken;
        // Attempt to refresh token to validate session
        // We need to wait for WebSocket connection first
        // This logic is moved to onopen or handled when WS connects
    }
}

// Initialize theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Toggle theme
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    triggerHaptic([15]);
}



// Initialize Lock Screen
function initLockScreen() {
    const savedLockState = localStorage.getItem('isLocked') === 'true';
    if (savedLockState) {
        lockInterface();
    }
}

// Lock Interface
function lockInterface() {
    isLocked = true;
    lockScreen.classList.remove('hidden');
    localStorage.setItem('isLocked', 'true');
    triggerHaptic([20]);
    disableGyroUI();
}

// Unlock Interface
function unlockInterface() {
    isLocked = false;
    lockScreen.classList.add('hidden');
    localStorage.setItem('isLocked', 'false');
    resetUnlockSlider();
    triggerHaptic([50]);
}

// Reset Unlock Slider
function resetUnlockSlider() {
    unlockThumb.style.transform = 'translateX(0)';
    unlockThumb.style.transition = 'transform 0.3s ease';
    setTimeout(() => {
        unlockThumb.style.transition = '';
    }, 300);
    triggerHaptic([10]);
}

// Initialize Screen Stream Toggle
function initScreenStream() {
    const showScreen = localStorage.getItem('showScreen') === 'true';
    screenToggle.checked = showScreen;

    // Restore saved resolutions
    const savedRes = localStorage.getItem('screenResolution');
    if (savedRes && resolutionSelect) {
        resolutionSelect.value = savedRes;
    }
    const savedWatchRes = localStorage.getItem('watchResolution');
    if (savedWatchRes && watchResolutionSelect) {
        watchResolutionSelect.value = savedWatchRes;
    }
}

// Initialize
function init() {
    initTheme();
    initLockScreen();
    initScreenStream();
    connectWebSocket();
    setupEventListeners();
}

// Setup Event Listeners
function setupEventListeners() {
    // Tab switching event listeners
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHaptic([15]);
            const targetTab = btn.dataset.tab;
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetElement = document.getElementById(`tab-${targetTab}`);
            if (targetElement) {
                targetElement.classList.add('active');
            }

            // Manage Watch stream lifecycle on tab switch
            const previousTab = activeTab;
            activeTab = targetTab;

            if (targetTab === 'watch' && previousTab !== 'watch') {
                startWatchStream();
            } else if (previousTab === 'watch' && targetTab !== 'watch') {
                stopWatchStream();
            }
        });
    });

    volumeSlider.addEventListener('input', handleSliderInput);
    muteBtn.addEventListener('click', handleMuteToggle);
    refreshBtn.addEventListener('click', refreshVolume);
    themeToggle.addEventListener('click', toggleTheme);
    lockBtn.addEventListener('click', lockInterface);

    // Resolution change events
    resolutionSelect.addEventListener('change', handleResolutionChange);
    watchResolutionSelect.addEventListener('change', handleWatchResolutionChange);

    // Watch fullscreen
    watchFullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWatchFullscreen();
    });
    watchExitFullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWatchFullscreen();
    });

    // Unlock Slider Events
    unlockThumb.addEventListener('mousedown', startUnlockDrag);
    document.addEventListener('mousemove', dragUnlock);
    document.addEventListener('mouseup', endUnlockDrag);

    unlockThumb.addEventListener('touchstart', startUnlockDrag, { passive: false });
    document.addEventListener('touchmove', dragUnlock, { passive: false });
    document.addEventListener('touchend', endUnlockDrag);

    // Arrow button event listeners
    const arrowButtons = document.querySelectorAll('.arrow-btn');
    arrowButtons.forEach(btn => {
        btn.addEventListener('click', handleArrowClick);
    });

    // Keyboard arrow key support
    document.addEventListener('keydown', handleKeyboardArrow);

    // Touchpad event listeners - Mouse events
    touchpad.addEventListener('mousedown', handleTouchpadStart);
    document.addEventListener('mousemove', handleTouchpadMove);
    document.addEventListener('mouseup', handleTouchpadEnd);

    // Touchpad event listeners - Touch events
    touchpad.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchpad.addEventListener('touchmove', handleTouchMove, { passive: false });
    touchpad.addEventListener('touchend', handleTouchEnd);

    // Touchpad Mouse Support (for desktop testing)
    touchpad.addEventListener('click', () => handleMouseClick('left'));
    touchpad.addEventListener('dblclick', () => handleMouseClick('left', true));
    touchpad.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleMouseClick('right');
    });
    touchpad.addEventListener('wheel', handleTouchpadWheel, { passive: false });

    // Click button event listeners - Removed
    // leftClickBtn.addEventListener('click', () => handleMouseClick('left'));
    // rightClickBtn.addEventListener('click', () => handleMouseClick('right'));

    // PIN Events
    connectBtn.addEventListener('click', submitPin);
    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitPin();
    });

    // Keyboard Events
    keyboardBtn.addEventListener('click', toggleKeyboard);
    hiddenInput.addEventListener('input', handleKeyboardInput);
    hiddenInput.addEventListener('keydown', handleKeyboardSpecialKey);

    // Live Screen Events
    screenToggle.addEventListener('change', (e) => toggleScreenStream(e.target.checked));

    // Gyroscope Mouse Events
    if (gyroToggle) {
        gyroToggle.addEventListener('change', handleGyroToggle);
    }
    if (gyroSensitivitySelect) {
        gyroSensitivitySelect.addEventListener('change', handleGyroSensitivityChange);
    }

    // Fullscreen Events
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });
    fullscreenBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    fullscreenBtn.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    fullscreenBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    fullscreenBtn.addEventListener('mouseup', (e) => e.stopPropagation());

    exitFullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });
    exitFullscreenBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    exitFullscreenBtn.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    exitFullscreenBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    exitFullscreenBtn.addEventListener('mouseup', (e) => e.stopPropagation());
}

// Submit PIN
function submitPin() {
    const pin = pinInput.value;
    if (pin.trim().length > 0) {
        sendWebSocketMessage('verifyPin', { pin });
        pinError.classList.add('hidden');
    } else {
        pinError.textContent = 'Please enter the PIN';
        pinError.classList.remove('hidden');
        triggerHaptic([50, 50]);
    }
}

// Debounce timer for real-time slider
let sliderDebounceTimer = null;

// Handle slider input (real-time update with debouncing)
function handleSliderInput(e) {
    const value = parseInt(e.target.value);
    updateVolumeDisplay(value);

    // Light haptic on slider move (optional, might be too much on some devices)
    // triggerHaptic([5]); 

    // Clear previous timer
    if (sliderDebounceTimer) {
        clearTimeout(sliderDebounceTimer);
    }

    // Send update after 15ms of no movement (debounce)
    sliderDebounceTimer = setTimeout(() => {
        setVolume(value);
    }, 15);
}

// Handle arrow button clicks
function handleArrowClick(e) {
    triggerHaptic([15]);
    const button = e.currentTarget;
    const key = button.dataset.key;
    simulateArrowKey(key);
}

// Handle keyboard arrow keys
function handleKeyboardArrow(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        simulateArrowKey(e.key);
    }
}

// Simulate arrow key press on the server
function simulateArrowKey(arrowKey) {
    // Convert ArrowUp -> up, ArrowDown -> down, etc.
    const key = arrowKey.replace('Arrow', '').toLowerCase();
    sendWebSocketMessage('pressArrow', { key });
}

// Throttled mouse movement state
let pendingDeltaX = 0;
let pendingDeltaY = 0;
let isMouseMoveScheduled = false;

function updateLocalCursorOverlay() {
    if (!screenToggle.checked) {
        remoteCursor.classList.add('hidden');
        return;
    }
    const touchpadRect = touchpad.getBoundingClientRect();
    const containerWidth = touchpadRect.width;
    const containerHeight = touchpadRect.height;

    const containerRatio = containerWidth / containerHeight;
    const imageRatio = serverScreenW / serverScreenH;
    
    let renderWidth, renderHeight, offsetLeft, offsetTop;

    if (imageRatio > containerRatio) {
        renderWidth = containerWidth;
        renderHeight = containerWidth / imageRatio;
        offsetLeft = 0;
        offsetTop = (containerHeight - renderHeight) / 2;
    } else {
        renderHeight = containerHeight;
        renderWidth = containerHeight * imageRatio;
        offsetLeft = (containerWidth - renderWidth) / 2;
        offsetTop = 0;
    }

    const cursorX = offsetLeft + (localMouseX / serverScreenW) * renderWidth;
    const cursorY = offsetTop + (localMouseY / serverScreenH) * renderHeight;

    remoteCursor.style.left = `${cursorX}px`;
    remoteCursor.style.top = `${cursorY}px`;
    remoteCursor.classList.remove('hidden');
}

function scheduleMouseMove(dx, dy) {
    pendingDeltaX += dx;
    pendingDeltaY += dy;

    // Optimistically update local cursor position
    localMouseX += dx;
    localMouseY += dy;
    localMouseX = Math.max(0, Math.min(localMouseX, serverScreenW));
    localMouseY = Math.max(0, Math.min(localMouseY, serverScreenH));
    updateLocalCursorOverlay();
    
    if (!isMouseMoveScheduled) {
        isMouseMoveScheduled = true;
        requestAnimationFrame(() => {
            if (pendingDeltaX !== 0 || pendingDeltaY !== 0) {
                sendWebSocketMessage('moveMouse', { deltaX: pendingDeltaX, deltaY: pendingDeltaY });
                pendingDeltaX = 0;
                pendingDeltaY = 0;
            }
            isMouseMoveScheduled = false;
        });
    }
}

// Throttled mouse scroll state
let pendingScrollX = 0;
let pendingScrollY = 0;
let isMouseScrollScheduled = false;

function scheduleMouseScroll(sx, sy) {
    pendingScrollX += sx;
    pendingScrollY += sy;

    if (!isMouseScrollScheduled) {
        isMouseScrollScheduled = true;
        requestAnimationFrame(() => {
            if (pendingScrollX !== 0 || pendingScrollY !== 0) {
                sendWebSocketMessage('scrollMouse', { x: pendingScrollX, y: pendingScrollY });
                pendingScrollX = 0;
                pendingScrollY = 0;
            }
            isMouseScrollScheduled = false;
        });
    }
}

// Touchpad handlers
function handleTouchpadStart(e) {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    touchpad.classList.add('dragging');

    // Double mousedown drag detection for desktop mouse testing
    const timeSinceLastMouseUp = Date.now() - lastMouseUpTime;
    if (timeSinceLastMouseUp < 300) {
        isMouseDoubleDragCandidate = true;
    } else {
        isMouseDoubleDragCandidate = false;
    }
}

function getRotatedDeltas(dx, dy) {
    return { x: dx, y: dy };
}

function handleTouchpadMove(e) {
    if (!isDragging) return;

    const rawDeltaX = Math.round((e.clientX - lastX) * sensitivity);
    const rawDeltaY = Math.round((e.clientY - lastY) * sensitivity);

    const moveX = Math.abs(e.clientX - mouseStartX);
    const moveY = Math.abs(e.clientY - mouseStartY);
    const dist = Math.sqrt(moveX * moveX + moveY * moveY);

    if (dist > TAP_THRESHOLD) {
        if (isMouseDoubleDragCandidate) {
            isMouseDoubleDragCandidate = false;
            isMouseDoubleDragging = true;
            sendWebSocketMessage('toggleMouse', { button: 'left', state: 'down' });
        }
    }

    const rotated = getRotatedDeltas(rawDeltaX, rawDeltaY);
    const deltaX = rotated.x;
    const deltaY = rotated.y;

    if (deltaX !== 0 || deltaY !== 0) {
        scheduleMouseMove(deltaX, deltaY);
    }

    lastX = e.clientX;
    lastY = e.clientY;
}

function handleTouchpadEnd() {
    isDragging = false;
    touchpad.classList.remove('dragging');
    lastMouseUpTime = Date.now();

    if (isMouseDoubleDragging) {
        sendWebSocketMessage('toggleMouse', { button: 'left', state: 'up' });
        isMouseDoubleDragging = false;
    }
    isMouseDoubleDragCandidate = false;
}

function handleTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const numFingers = e.touches.length;
    // Update fingers count if more fingers are detected mid-gesture
    const storedFingers = parseInt(touchpad.dataset.fingers || '1');
    if (numFingers > storedFingers) {
        touchpad.dataset.fingers = numFingers;
    }

    if (numFingers === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentX = (touch1.clientX + touch2.clientX) / 2;
        const currentY = (touch1.clientY + touch2.clientY) / 2;

        // Only cancel tap if the fingers actually drag/move past the threshold
        const moveX = Math.abs(currentX - touchStartX);
        const moveY = Math.abs(currentY - touchStartY);
        if (moveX > TAP_THRESHOLD || moveY > TAP_THRESHOLD) {
            isTap = false;
        }

        // Scale scroll sensitivity (increased speed)
        const rawDeltaX = (currentX - lastX) / 2;
        const rawDeltaY = (currentY - lastY) / 2;

        const rotated = getRotatedDeltas(rawDeltaX, rawDeltaY);
        const deltaX = rotated.x;
        const deltaY = rotated.y;

        scrollAccumulatorX += deltaX;
        scrollAccumulatorY += deltaY;

        let scrollX = 0;
        let scrollY = 0;

        if (Math.abs(scrollAccumulatorX) >= 1) {
            scrollX = Math.trunc(scrollAccumulatorX);
            scrollAccumulatorX -= scrollX;
        }
        if (Math.abs(scrollAccumulatorY) >= 1) {
            scrollY = Math.trunc(scrollAccumulatorY);
            scrollAccumulatorY -= scrollY;
        }

        if (scrollX !== 0 || scrollY !== 0) {
            // Drag up (negative delta) scrolls content down (negative y in robotjs)
            scheduleMouseScroll(scrollX, scrollY);
        }

        lastX = currentX;
        lastY = currentY;
    } else {
        const touch = e.touches[0];

        // Check if movement exceeds tap threshold
        const moveX = Math.abs(touch.clientX - touchStartX);
        const moveY = Math.abs(touch.clientY - touchStartY);
        const dist = Math.sqrt(moveX * moveX + moveY * moveY);
        if (dist > TAP_THRESHOLD) {
            isTap = false;

            // Double-tap and drag logic
            if (isDoubleTapDraggingCandidate) {
                isDoubleTapDraggingCandidate = false;
                isDoubleTapDragging = true;
                sendWebSocketMessage('toggleMouse', { button: 'left', state: 'down' });
                triggerHaptic([30]);
            }
        }

        const rawDeltaX = Math.round((touch.clientX - lastX) * sensitivity);
        const rawDeltaY = Math.round((touch.clientY - lastY) * sensitivity);

        const rotated = getRotatedDeltas(rawDeltaX, rawDeltaY);
        const deltaX = rotated.x;
        const deltaY = rotated.y;

        if (deltaX !== 0 || deltaY !== 0) {
            scheduleMouseMove(deltaX, deltaY);
        }

        lastX = touch.clientX;
        lastY = touch.clientY;
    }
}

// Improved Touch End with Gesture Support
function handleTouchStart(e) {
    e.preventDefault();
    isDragging = true;
    isTap = true;
    touchStartTime = Date.now();

    const touch = e.touches[0];
    
    if (e.touches.length === 2) {
        const touch2 = e.touches[1];
        lastX = (touch.clientX + touch2.clientX) / 2;
        lastY = (touch.clientY + touch2.clientY) / 2;
        touchStartX = lastX;
        touchStartY = lastY;

        // Cancel double tap dragging candidate/state if second finger is added
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }
        if (isDoubleTapDraggingCandidate) {
            isDoubleTapDraggingCandidate = false;
        }
        if (isDoubleTapDragging) {
            isDoubleTapDragging = false;
            sendWebSocketMessage('toggleMouse', { button: 'left', state: 'up' });
        }
    } else {
        lastX = touch.clientX;
        lastY = touch.clientY;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        // Double tap detection
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            isDoubleTapDraggingCandidate = true;
        } else {
            isDoubleTapDraggingCandidate = false;
        }
    }
    
    scrollAccumulatorX = 0;
    scrollAccumulatorY = 0;

    // Store number of fingers
    touchpad.dataset.fingers = e.touches.length;

    touchpad.classList.add('dragging');
}

function handleTouchEnd(e) {
    isDragging = false;
    touchpad.classList.remove('dragging');

    if (isDoubleTapDragging) {
        sendWebSocketMessage('toggleMouse', { button: 'left', state: 'up' });
        isDoubleTapDragging = false;
        return;
    }

    if (isDoubleTapDraggingCandidate) {
        // Double tapped without dragging -> Double click!
        handleMouseClick('left', true);
        isDoubleTapDraggingCandidate = false;
        return;
    }

    if (isTap) {
        isTap = false; // Prevent multiple click triggers from successive finger lifts
        const duration = Date.now() - touchStartTime;
        if (duration < TAP_DURATION) {
            const fingers = parseInt(touchpad.dataset.fingers || '1');
            if (fingers === 1) {
                // Delay single click to verify if a double tap occurs
                clickTimeout = setTimeout(() => {
                    handleMouseClick('left');
                    clickTimeout = null;
                }, 200);
            } else if (fingers === 2) {
                handleMouseClick('right');
            }
        }
    }
}

function handleTouchpadWheel(e) {
    e.preventDefault();
    let scrollX = 0;
    let scrollY = 0;

    if (e.deltaX !== 0) {
        scrollX = e.deltaX > 0 ? Math.ceil(e.deltaX / 10) : Math.floor(e.deltaX / 10);
    }
    if (e.deltaY !== 0) {
        scrollY = e.deltaY > 0 ? Math.ceil(e.deltaY / 10) : Math.floor(e.deltaY / 10);
    }

    if (scrollX !== 0 || scrollY !== 0) {
        // e.deltaY is positive when scrolling down; robotjs needs negative value to scroll down
        scheduleMouseScroll(scrollX, -scrollY);
    }
}

function handleMouseClick(button, double = false) {
    triggerHaptic([20]);
    sendWebSocketMessage('mouseClick', { button, double });
}

// Unlock Slider Logic
function startUnlockDrag(e) {
    isUnlockDragging = true;
    unlockStartX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;

    // Calculate dimensions
    const thumbRect = unlockThumb.getBoundingClientRect();
    const trackRect = unlockTrack.getBoundingClientRect();
    unlockThumbWidth = thumbRect.width;
    unlockTrackWidth = trackRect.width;
    maxDrag = unlockTrackWidth - unlockThumbWidth - 8; // 8px padding

    unlockThumb.style.transition = 'none';
}

function dragUnlock(e) {
    if (!isUnlockDragging) return;
    e.preventDefault(); // Prevent scrolling on touch

    const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const delta = currentX - unlockStartX;

    // Clamp value
    let newPos = Math.max(0, Math.min(delta, maxDrag));

    unlockThumb.style.transform = `translateX(${newPos}px)`;
}

function endUnlockDrag(e) {
    if (!isUnlockDragging) return;
    isUnlockDragging = false;

    const currentTransform = new WebKitCSSMatrix(window.getComputedStyle(unlockThumb).transform);
    const currentX = currentTransform.m41;

    // Unlock threshold (e.g., 80% of track)
    if (currentX > maxDrag * 0.8) {
        unlockInterface();
    } else {
        resetUnlockSlider();
    }
}

// Update volume display
function updateVolumeDisplay(volume) {
    volumeDisplay.textContent = volume;
    sliderFill.style.width = `${volume}%`;
}

// Set volume on server
function setVolume(volume) {
    if (isUpdating) return;
    isUpdating = true;
    sendWebSocketMessage('setVolume', { volume });
}

// Toggle mute
function handleMuteToggle() {
    if (isUpdating) return;
    isUpdating = true;
    triggerHaptic([20]);

    const newMutedState = !isMuted;
    sendWebSocketMessage('setMute', { muted: newMutedState });
}

// Update mute button appearance
function updateMuteButton(muted) {
    if (muted) {
        muteBtn.classList.add('muted');
        muteBtnText.textContent = 'Unmute';
        muteIcon.innerHTML = `
            <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        `;
    } else {
        muteBtn.classList.remove('muted');
        muteBtnText.textContent = 'Mute';
        muteIcon.innerHTML = `
            <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15.54 8.46C16.4774 9.39764 17.0039 10.6692 17.0039 11.995C17.0039 13.3208 16.4774 14.5924 15.54 15.53" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19.07 4.93C20.9447 6.80528 21.9979 9.34836 21.9979 12C21.9979 14.6516 20.9447 17.1947 19.07 19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        `;
    }
}

// Refresh volume and mute status
function refreshVolume() {
    triggerHaptic([15]);
    sendWebSocketMessage('getVolume');
    sendWebSocketMessage('getMute');
}

// Show success status
function showSuccess() {
    statusElement.classList.remove('error');
    statusElement.innerHTML = `
        <div class="status-dot"></div>
        <span>Connected</span>
    `;
}

// Show error status
function showError(message) {
    statusElement.classList.add('error');
    statusElement.innerHTML = `
        <div class="status-dot"></div>
        <span>${message}</span>
    `;

    // Reset to normal after 3 seconds
    setTimeout(() => {
        showSuccess();
    }, 3000);
}

// Keyboard Functions
function toggleKeyboard() {
    triggerHaptic([15]);
    if (document.activeElement === hiddenInput) {
        hiddenInput.blur();
        keyboardBtn.classList.remove('active');
    } else {
        hiddenInput.focus();
        keyboardBtn.classList.add('active');
        hiddenInput.value = '';
    }
}

// Automatically update keyboard button styling if user blurs keyboard manually (e.g. by pressing done/hide on mobile)
if (hiddenInput) {
    hiddenInput.addEventListener('blur', () => {
        keyboardBtn.classList.remove('active');
    });
}

function handleKeyboardInput(e) {
    const text = e.target.value;
    if (text.length > 0) {
        sendWebSocketMessage('typeText', { text: text });
        e.target.value = '';
    }
}

function handleKeyboardSpecialKey(e) {
    const specialKeys = {
        'Backspace': 'backspace',
        'Enter': 'enter',
        'Escape': 'escape',
        'Tab': 'tab',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right'
    };

    if (specialKeys[e.key]) {
        e.preventDefault();
        sendWebSocketMessage('pressKey', { key: specialKeys[e.key] });
    }
}

function toggleScreenStream(show) {
    triggerHaptic([15]);
    localStorage.setItem('showScreen', show);
    
    if (show) {
        if (isAuthenticated) {
            const resolution = resolutionSelect.value || '720p';
            sendWebSocketMessage('startScreenStream', { resolution });
        }
    } else {
        if (isAuthenticated) {
            sendWebSocketMessage('stopScreenStream');
        }
        screenStream.classList.add('hidden');
        screenStream.removeAttribute('src');
        remoteCursor.classList.add('hidden');
    }
}

let touchpadParent = null;
let touchpadSibling = null;

function toggleFullscreen() {
    triggerHaptic([15]);
    const isFullscreen = touchpad.classList.toggle('fullscreen-mode');
    document.body.classList.toggle('fullscreen-active', isFullscreen);
    exitFullscreenBtn.classList.toggle('hidden', !isFullscreen);
    fullscreenBtn.classList.toggle('active', isFullscreen);

    if (isFullscreen) {
        // Save original parent location and teleport to body to escape containing blocks (e.g. backdrop-filter)
        touchpadParent = touchpad.parentElement;
        touchpadSibling = touchpad.nextSibling;
        document.body.appendChild(touchpad);

        // Auto-enable live screen stream when entering fullscreen touchpad
        if (!screenToggle.checked) {
            screenToggle.checked = true;
            toggleScreenStream(true);
        }
        
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.log('Browser fullscreen not supported or denied:', err);
            });
        }
    } else {
        // Teleport back to original DOM hierarchy
        if (touchpadParent) {
            touchpadParent.insertBefore(touchpad, touchpadSibling);
        }

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch((err) => {
                console.log('Error exiting browser fullscreen:', err);
            });
        }
    }
}

// Sync states if browser native fullscreen is toggled or exited (e.g., ESC key)
document.addEventListener('fullscreenchange', () => {
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    if (!isCurrentlyFullscreen) {
        if (touchpad.classList.contains('fullscreen-mode')) {
            touchpad.classList.remove('fullscreen-mode');
            document.body.classList.remove('fullscreen-active');
            exitFullscreenBtn.classList.add('hidden');
            fullscreenBtn.classList.remove('active');

            // Teleport back to original DOM hierarchy
            if (touchpadParent) {
                touchpadParent.insertBefore(touchpad, touchpadSibling);
            }
        }
        if (watchContainer.classList.contains('fullscreen-mode')) {
            watchContainer.classList.remove('fullscreen-mode');
            document.body.classList.remove('fullscreen-active');
            watchExitFullscreenBtn.classList.add('hidden');

            // Teleport back to original DOM hierarchy
            if (watchParent) {
                watchParent.insertBefore(watchContainer, watchSibling);
            }
        }
    }
});

// --- Frame rendering helpers ---
function renderTouchpadFrame(blob) {
    const url = URL.createObjectURL(blob);
    const oldUrl = screenStream.src;
    screenStream.src = url;
    if (oldUrl && oldUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl);
    }
    if (screenStream.classList.contains('hidden')) {
        screenStream.classList.remove('hidden');
    }
}

function renderWatchFrame(blob) {
    const url = URL.createObjectURL(blob);
    const oldUrl = watchStream.src;
    watchStream.src = url;
    if (oldUrl && oldUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl);
    }
    if (!watchStream.classList.contains('active')) {
        watchStream.classList.add('active');
    }
    if (!watchPlaceholder.classList.contains('hidden')) {
        watchPlaceholder.classList.add('hidden');
    }
}

// --- Audio playback for Watch mode ---
function handleAudioChunk(arrayBuffer) {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22050 });
        } catch (e) {
            console.error('Web Audio API not supported:', e);
            return;
        }
    }

    // Show audio indicator
    if (!watchAudioIndicator.classList.contains('active')) {
        watchAudioIndicator.classList.add('active');
    }

    // Decode and play the MP3 audio chunk
    audioContext.decodeAudioData(arrayBuffer.slice(0), (audioBuffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
    }, (err) => {
        // Decoding errors are expected for partial MP3 chunks, ignore silently
    });
}

function stopAudio() {
    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
    if (watchAudioIndicator) {
        watchAudioIndicator.classList.remove('active');
    }
}

// --- Watch mode lifecycle ---
function startWatchStream() {
    if (!isAuthenticated) return;
    isWatchActive = true;
    const resolution = watchResolutionSelect.value || '720p';
    sendWebSocketMessage('startWatchStream', { resolution });
    console.log('👁️ Watch stream started at', resolution);
}

function stopWatchStream() {
    isWatchActive = false;
    sendWebSocketMessage('stopWatchStream');
    stopAudio();

    // Reset watch UI
    watchStream.classList.remove('active');
    watchStream.removeAttribute('src');
    watchPlaceholder.classList.remove('hidden');
    console.log('👁️ Watch stream stopped');
}

// --- Resolution change handlers ---
function handleResolutionChange() {
    const resolution = resolutionSelect.value;
    localStorage.setItem('screenResolution', resolution);

    // Update stream resolution on-the-fly
    if (screenToggle.checked && isAuthenticated) {
        sendWebSocketMessage('startScreenStream', { resolution });
    }
}

function handleWatchResolutionChange() {
    const resolution = watchResolutionSelect.value;
    localStorage.setItem('watchResolution', resolution);

    // Update watch stream resolution on-the-fly
    if (isWatchActive && isAuthenticated) {
        sendWebSocketMessage('startWatchStream', { resolution });
    }
}

// --- Watch fullscreen toggle ---
function toggleWatchFullscreen() {
    triggerHaptic([15]);
    const isFullscreen = watchContainer.classList.toggle('fullscreen-mode');
    document.body.classList.toggle('fullscreen-active', isFullscreen);
    watchExitFullscreenBtn.classList.toggle('hidden', !isFullscreen);

    if (isFullscreen) {
        // Save original parent location and teleport to body to escape containing blocks (e.g. backdrop-filter)
        watchParent = watchContainer.parentElement;
        watchSibling = watchContainer.nextSibling;
        document.body.appendChild(watchContainer);

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    } else {
        // Teleport back to original DOM hierarchy
        if (watchParent) {
            watchParent.insertBefore(watchContainer, watchSibling);
        }

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }
}

// --- Gyroscope Mouse Helpers ---

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast-container';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    
    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

async function requestGyroPermission() {
    let orientationGranted = false;
    let motionGranted = false;

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            orientationGranted = state === 'granted';
        } catch (error) {
            console.error('Error requesting orientation permission:', error);
        }
    } else {
        orientationGranted = 'ondeviceorientation' in window || 'DeviceOrientationEvent' in window;
    }

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const state = await DeviceMotionEvent.requestPermission();
            motionGranted = state === 'granted';
        } catch (error) {
            console.error('Error requesting motion permission:', error);
        }
    } else {
        motionGranted = 'ondevicemotion' in window || 'DeviceMotionEvent' in window;
    }

    return orientationGranted && motionGranted;
}

function startGyro() {
    isGyroActive = true;
    lastBeta = null;
    lastGamma = null;
    smoothX = 0;
    smoothY = 0;
    velocityX = 0;
    velocityY = 0;
    window.addEventListener('deviceorientation', handleGyroscope);
    window.addEventListener('devicemotion', handleMotion);
    showToast('Sensors Enabled (Tilt & Slide)');
}

function stopGyro() {
    isGyroActive = false;
    window.removeEventListener('deviceorientation', handleGyroscope);
    window.removeEventListener('devicemotion', handleMotion);
    showToast('Sensors Disabled');
}

function handleGyroscope(e) {
    if (!isGyroActive) return;

    const beta = e.beta;
    const gamma = e.gamma;

    if (beta === null || gamma === null) return;

    if (lastBeta === null || lastGamma === null) {
        lastBeta = beta;
        lastGamma = gamma;
        return;
    }

    const deltaBeta = beta - lastBeta;
    const deltaGamma = gamma - lastGamma;

    // Ignore major flip anomalies (device rotated rapidly)
    if (Math.abs(deltaBeta) > 45 || Math.abs(deltaGamma) > 45) {
        lastBeta = beta;
        lastGamma = gamma;
        return;
    }

    // Get current screen orientation angle (portrait vs landscape)
    const orientation = window.orientation || (screen.orientation && screen.orientation.angle) || 0;
    const angleRad = (orientation * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Rotate coordination axes based on orientation
    const rotatedX = deltaGamma * cos + deltaBeta * sin;
    const rotatedY = deltaBeta * cos - deltaGamma * sin;

    // Apply scale factors (sensitivity multiplier and baseline scale)
    const baseScale = 8;
    const rawMoveX = rotatedX * baseScale * gyroSensitivity;
    const rawMoveY = rotatedY * baseScale * gyroSensitivity;

    // Low pass filter smoothing
    const smoothing = 0.25;
    smoothX = (rawMoveX * smoothing) + (smoothX * (1 - smoothing));
    smoothY = (rawMoveY * smoothing) + (smoothY * (1 - smoothing));

    const finalMoveX = Math.round(smoothX);
    const finalMoveY = Math.round(smoothY);

    const threshold = 0.05;
    if (Math.abs(smoothX) > threshold || Math.abs(smoothY) > threshold) {
        if (finalMoveX !== 0 || finalMoveY !== 0) {
            scheduleMouseMove(finalMoveX, finalMoveY);
        }
    }

    lastBeta = beta;
    lastGamma = gamma;
}

function handleMotion(e) {
    if (!isGyroActive) return;

    // Prefer linear acceleration (gravity excluded).
    // Fall back to accelerationIncludingGravity if the device doesn't support gravity separation.
    // When phone is flat on desk, gravity is almost entirely on Z axis,
    // so X and Y from accelerationIncludingGravity are still usable.
    const accel = (e.acceleration && e.acceleration.x !== null)
        ? e.acceleration
        : e.accelerationIncludingGravity;

    if (!accel || accel.x === null || accel.y === null) return;

    let ax = accel.x;
    let ay = accel.y;

    // Deadzone filter — reject sensor noise and minor desk vibrations
    const deadzone = 0.4; // m/s²
    const axAbove = Math.abs(ax) >= deadzone;
    const ayAbove = Math.abs(ay) >= deadzone;
    if (!axAbove) ax = 0;
    if (!ayAbove) ay = 0;

    // If nothing above deadzone, just apply friction and exit
    if (!axAbove && !ayAbove) {
        // Aggressive friction when phone is still — stop cursor quickly
        velocityX *= 0.6;
        velocityY *= 0.6;
        if (Math.abs(velocityX) < 0.5) velocityX = 0;
        if (Math.abs(velocityY) < 0.5) velocityY = 0;

        const mx = Math.round(velocityX);
        const my = Math.round(velocityY);
        if (mx !== 0 || my !== 0) {
            scheduleMouseMove(mx, my);
        }
        return;
    }

    // Rotate acceleration vector based on screen orientation
    const orientation = window.orientation || (screen.orientation && screen.orientation.angle) || 0;
    const angleRad = (orientation * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const rotatedX = ax * cos + ay * sin;
    const rotatedY = ay * cos - ax * sin;

    // Delta time in seconds
    const dt = (e.interval || 16) / 1000;

    // Integrate acceleration into velocity
    // X axis: slide right → positive accel.x → positive deltaX → cursor moves right (correct, no negation)
    // Y axis: slide forward (away from user) → positive accel.y → but screen Y is inverted → negate
    const accelScale = 120;
    velocityX += rotatedX * dt * accelScale * gyroSensitivity;
    velocityY += -rotatedY * dt * accelScale * gyroSensitivity;

    // Gentle friction while actively sliding — preserve momentum
    velocityX *= 0.92;
    velocityY *= 0.92;

    const finalMoveX = Math.round(velocityX);
    const finalMoveY = Math.round(velocityY);

    if (finalMoveX !== 0 || finalMoveY !== 0) {
        scheduleMouseMove(finalMoveX, finalMoveY);
    }
}

async function handleGyroToggle(e) {
    triggerHaptic([15]);
    if (e.target.checked) {
        const granted = await requestGyroPermission();
        if (granted) {
            startGyro();
        } else {
            e.target.checked = false;
            showToast('Sensor access denied or not supported');
        }
    } else {
        stopGyro();
    }
}

function handleGyroSensitivityChange(e) {
    gyroSensitivity = parseFloat(e.target.value);
    showToast(`Sensor sensitivity: ${e.target.value}x`);
}

function disableGyroUI() {
    if (gyroToggle) {
        gyroToggle.checked = false;
    }
    if (isGyroActive) {
        stopGyro();
    }
}

// Initialize the app
init();
