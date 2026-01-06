/**
 * Rial Web App - Insurance Fraud Prevention
 * Full-featured Progressive Web App with Real ZK Integration
 */

// =====================================
// Configuration & State Management
// =====================================

const CONFIG = {
    API_BASE: window.location.origin,
    ENDPOINTS: {
        test: '/test',
        prove: '/prove',
        verify: '/verify-image',
        secureVerify: '/secure-verify',
        challenge: '/verify/challenge',
        storeStatus: '/store-status',
        health: '/health'
    }
};

const state = {
    backendOnline: false,
    photos: [],
    currentStream: null,
    currentPhoto: null,
    zkEnabled: false,
    stats: {
        totalCertified: 0,
        zkProofs: 0,
        successRate: 100,
        fraudPrevented: 0
    }
};

// Helper functions for show/hide (compatible with .hidden class)
function showElement(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        el.style.display = '';
    }
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');

        // Special handling for iOS-style processing overlay
        if (id === 'processingSection') {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    }
}

// =====================================
// Initialization
// =====================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Rial Web App Loading...');
    initApp();
});

async function initApp() {
    // Try WebAuthn first (hardware security), fallback to Web Crypto
    try {
        if (window.WebAuthnCrypto) {
            const webauthnStatus = await WebAuthnCrypto.init();

            if (webauthnStatus.supported) {
                state.webauthnSupported = true;

                if (webauthnStatus.registered) {
                    state.cryptoReady = true;
                    state.useWebAuthn = true;
                    console.log('🔐 WebAuthn ready (hardware security)');
                    showToast('Biometric security enabled', 'success');
                } else {
                    // Show registration prompt
                    console.log('🔐 WebAuthn available - needs registration');
                    showWebAuthnSetupPrompt();
                }
            } else {
                console.log('⚠️ WebAuthn not available:', webauthnStatus.reason);
            }
        }

        // Fallback to regular Web Crypto if WebAuthn not used
        if (!state.useWebAuthn) {
            await TrueShotCrypto.init();
            state.cryptoReady = true;
            console.log('🔐 Web Crypto initialized (software keys)');
        }
    } catch (error) {
        console.error('⚠️ Crypto init failed:', error);
        state.cryptoReady = false;
    }

    // Check backend status
    await checkBackendStatus();

    // Load saved photos from localStorage
    loadPhotosFromStorage();

    // Setup event listeners
    setupEventListeners();

    // Check location
    checkLocation();

    // Update UI
    updateStats();
    updateGallery();

    console.log('✅ Rial Web App Ready!');
}

// =====================================
// Backend Status Check
// =====================================

async function checkBackendStatus() {
    try {
        const response = await fetch(CONFIG.ENDPOINTS.test);
        const data = await response.json();

        if (data.message) {
            state.backendOnline = true;
            state.zkEnabled = true;
            updateStatusUI(true);

            // Update backend info (with null checks for new UI)
            const serverStatus = document.getElementById('serverStatus');
            const connectionStatus = document.getElementById('connectionStatus');

            if (serverStatus) {
                serverStatus.innerHTML = '<span style="color: var(--accent);">●</span> Connected';
            }
            if (connectionStatus) {
                connectionStatus.textContent = 'Connected';
            }

            showToast('Connected to ZK backend', 'success');
        }
    } catch (error) {
        state.backendOnline = false;
        state.zkEnabled = false;
        updateStatusUI(false);

        const serverStatus = document.getElementById('serverStatus');
        const connectionStatus = document.getElementById('connectionStatus');

        if (serverStatus) {
            serverStatus.innerHTML = '<span style="color: var(--red);">●</span> Offline';
        }
        if (connectionStatus) {
            connectionStatus.textContent = 'Offline';
        }

        showToast('Backend offline - local mode', 'info');
    }
}

function updateStatusUI(online) {
    // Status is now updated in checkBackendStatus
}

function checkLocation() {
    const locationEl = document.getElementById('locationStatus');
    if (!locationEl) return;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // Support both old and new UI structures
                if (locationEl.querySelector('.status-indicator')) {
                    locationEl.innerHTML = '<span class="status-indicator green"></span>GPS Ready';
                } else {
                    locationEl.innerHTML = '<span style="color: var(--green);">●</span> GPS Ready';
                }
            },
            (err) => {
                if (locationEl.querySelector('.status-indicator')) {
                    locationEl.innerHTML = '<span class="status-indicator orange"></span>No Access';
                } else {
                    locationEl.innerHTML = '<span style="color: var(--orange);">●</span> No Access';
                }
            },
            { timeout: 5000 }
        );
    } else {
        if (locationEl.querySelector('.status-indicator')) {
            locationEl.innerHTML = '<span class="status-indicator orange"></span>Not Supported';
        } else {
            locationEl.innerHTML = '<span style="color: var(--red);">●</span> Not Supported';
        }
    }
}

// =====================================
// Event Listeners Setup
// =====================================

function setupEventListeners() {
    // Tab navigation (old tab system - keep for compatibility)
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Capture tab buttons (support both old and new UI)
    const openCameraBtn = document.getElementById('openCameraBtn');
    if (openCameraBtn) {
        openCameraBtn.addEventListener('click', openCamera);
    }

    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    if (uploadPhotoBtn) {
        uploadPhotoBtn.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
    }

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }

    // Camera controls (old UI)
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) {
        captureBtn.addEventListener('click', capturePhoto);
    }

    const closeCameraBtn = document.getElementById('closeCameraBtn');
    if (closeCameraBtn) {
        closeCameraBtn.addEventListener('click', closeCamera);
    }

    // Instant capture button (fallback for Live Photo issues)
    const instantBtn = document.getElementById('instantCaptureBtn');
    if (instantBtn) {
        instantBtn.addEventListener('click', instantCapture);
    }

    // Preview controls
    const certifyBtn = document.getElementById('certifyBtn');
    if (certifyBtn) {
        certifyBtn.addEventListener('click', certifyPhoto);
    }

    const retakeBtn = document.getElementById('retakeBtn');
    if (retakeBtn) {
        retakeBtn.addEventListener('click', retakePhoto);
    }

    // Verify tab
    const verifyUploadBtn = document.getElementById('verifyUploadBtn');
    if (verifyUploadBtn) {
        verifyUploadBtn.addEventListener('click', () => {
            document.getElementById('verifyFileInput').click();
        });
    }

    const verifyFileInput = document.getElementById('verifyFileInput');
    if (verifyFileInput) {
        verifyFileInput.addEventListener('change', handleVerifyUpload);
    }

    document.getElementById('verifyCodeBtn')?.addEventListener('click', verifyByShareCode);
    document.getElementById('shareCodeInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyByShareCode();
    });

    // Modal
    const closeModalBtn = document.getElementById('closeModal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    const photoModal = document.getElementById('photoModal');
    if (photoModal) {
        photoModal.addEventListener('click', (e) => {
            if (e.target.id === 'photoModal') closeModal();
        });
    }

    // Edit functionality
    const editUploadBtn = document.getElementById('editUploadBtn');
    if (editUploadBtn) {
        editUploadBtn.addEventListener('click', () => {
            document.getElementById('editFileInput')?.click();
        });
    }
}

// =====================================
// Tab Navigation
// =====================================

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        const contentId = content.id.replace('Tab', '');
        content.classList.toggle('active', contentId === tabName);
    });
    
    if (tabName === 'gallery') {
        updateGallery();
    }
}

// =====================================
// Camera Functionality
// =====================================

async function openCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        state.currentStream = stream;

        const video = document.getElementById('video');
        video.srcObject = stream;

        document.getElementById('captureOptions').classList.add('hidden');
        document.getElementById('cameraSection').classList.remove('hidden');

        showToast('Camera ready', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Camera access denied', 'error');
    }
}

function closeCamera() {
    if (state.currentStream) {
        state.currentStream.getTracks().forEach(track => track.stop());
        state.currentStream = null;
    }

    document.getElementById('cameraSection').classList.add('hidden');
    document.getElementById('captureOptions').classList.remove('hidden');
}

/**
 * Instant capture - single frame, no Live Photo analysis
 * Use this if Live Photo mode isn't working
 */
async function instantCapture() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    // Wait for video to be ready
    if (!video.videoWidth || !video.videoHeight) {
        showToast('Waiting for camera...', 'info');
        let waitTime = 0;
        while ((!video.videoWidth || !video.videoHeight) && waitTime < 3000) {
            await new Promise(r => setTimeout(r, 100));
            waitTime += 100;
        }

        if (!video.videoWidth || !video.videoHeight) {
            showToast('Camera not ready. Please try again.', 'error');
            return;
        }
    }

    showToast('Capturing...', 'info');

    // Capture single frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Check if frame is valid (not black)
    const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
    let brightness = 0;
    for (let i = 0; i < imageData.data.length; i += 16) {
        brightness += imageData.data[i] + imageData.data[i+1] + imageData.data[i+2];
    }
    brightness /= (imageData.data.length / 16);

    if (brightness < 5) {
        showToast('Black frame detected. Please try again.', 'error');
        return;
    }

    // Convert to blob
    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('Failed to capture photo', 'error');
            return;
        }

        state.currentPhoto = blob;
        state.livePhotoFrames = null;
        state.livenessResult = { isLive: false, score: 0, skipped: true, reason: 'Instant capture mode' };

        // Show preview - support both old and new UI
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            document.getElementById('previewImage').src = imageUrl;

            // New iPhone-style UI: use preview sheet
            const previewSheet = document.getElementById('previewSheet');
            if (previewSheet) {
                previewSheet.classList.add('active');
            } else {
                // Old UI: show preview section
                hideElement('captureOptions');
                showElement('previewSection');
            }

            // Also call the global preview sheet function if available
            if (typeof window.showPreviewSheet === 'function') {
                window.showPreviewSheet(imageUrl);
            }

            // Add instant capture badge (old UI only)
            const previewContainer = document.querySelector('.preview-container');
            if (previewContainer) {
                let badge = document.getElementById('livenessBadge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'livenessBadge';
                    badge.style.cssText = `
                        position: absolute; top: 1rem; left: 1rem; padding: 0.5rem 1rem;
                        border-radius: 20px; font-size: 0.8rem; font-weight: 600;
                        color: white; z-index: 10; backdrop-filter: blur(10px);
                    `;
                    previewContainer.style.position = 'relative';
                    previewContainer.appendChild(badge);
                }
                badge.style.background = 'rgba(107, 114, 128, 0.9)';
                badge.textContent = '⚡ Instant Capture';
            }
        };
        reader.readAsDataURL(blob);

        closeCamera();
        showToast('Photo captured!', 'success');

        // Run AI detection
        setTimeout(() => runAIDetectionOnPreview(), 100);

    }, 'image/jpeg', 0.9);
}

async function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    // Wait for video to be ready
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        showToast('Waiting for camera...', 'info');

        // Wait up to 3 seconds for video to be ready
        let waitTime = 0;
        while ((!video.videoWidth || !video.videoHeight || video.readyState < 2) && waitTime < 3000) {
            await new Promise(r => setTimeout(r, 100));
            waitTime += 100;
        }

        if (!video.videoWidth || !video.videoHeight) {
            showToast('Camera not ready. Please try again.', 'error');
            return;
        }
    }

    // Start Live Photo capture (2 seconds)
    showToast('Hold still - Live Photo capturing...', 'info');

    const captureBtn = document.querySelector('.camera-btn:not(.camera-btn-secondary)');
    if (captureBtn) {
        captureBtn.disabled = true;
        captureBtn.style.background = '#ef4444';
        captureBtn.innerHTML = '●';
    }

    const frames = [];
    const startTime = Date.now();
    const captureWindow = 2000; // 2 seconds
    const frameInterval = 100;  // 10 fps = 20 frames

    // Track device motion
    let currentMotion = { alpha: 0, beta: 0, gamma: 0, x: 0, y: 0, z: 0 };

    const handleOrientation = (e) => {
        currentMotion.alpha = e.alpha || 0;
        currentMotion.beta = e.beta || 0;
        currentMotion.gamma = e.gamma || 0;
    };

    const handleMotion = (e) => {
        if (e.acceleration) {
            currentMotion.x = e.acceleration.x || 0;
            currentMotion.y = e.acceleration.y || 0;
            currentMotion.z = e.acceleration.z || 0;
        }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);

    // Capture frames with validation
    const captureFrame = () => {
        // Skip if video not ready
        if (!video.videoWidth || !video.videoHeight) {
            console.log('Skipping frame - video not ready');
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Check if frame is not black (sample a few pixels)
        const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
        let brightness = 0;
        for (let i = 0; i < imageData.data.length; i += 16) { // Sample every 4th pixel
            brightness += imageData.data[i] + imageData.data[i+1] + imageData.data[i+2];
        }
        brightness /= (imageData.data.length / 16);

        // Skip if too dark (likely black frame)
        if (brightness < 5) {
            console.log('Skipping black frame');
            return;
        }

        frames.push({
            data: canvas.toDataURL('image/jpeg', 0.7),
            timestamp: Date.now() - startTime,
            motion: { ...currentMotion }
        });
    };

    const intervalId = setInterval(captureFrame, frameInterval);

    // After 2 seconds, analyze and show preview
    setTimeout(async () => {
        clearInterval(intervalId);
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);

        if (captureBtn) {
            captureBtn.disabled = false;
            captureBtn.style.background = '';
            captureBtn.innerHTML = '📸';
        }

        console.log(`📸 Live Photo: ${frames.length} frames captured`);

        // Check if we have enough frames
        if (frames.length < 3) {
            showToast('Not enough frames captured. Please try again.', 'error');
            if (captureBtn) {
                captureBtn.disabled = false;
                captureBtn.style.background = '';
                captureBtn.innerHTML = '📸';
            }
            return;
        }

        // Analyze liveness
        let livenessResult = null;
        try {
            const response = await fetch('/api/liveness/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frames })
            });
            const data = await response.json();
            livenessResult = data.liveness;
            state.livenessResult = livenessResult;

            if (livenessResult?.isLive) {
                showToast(`✅ Live scene verified (${livenessResult.score}%)`, 'success');
            } else {
                showToast(`⚠️ Liveness warning (${livenessResult?.score || 0}%)`, 'warning');
            }
        } catch (err) {
            console.log('Liveness check skipped:', err.message);
        }

        // Use middle frame as main photo (or last valid frame if middle is problematic)
        let mainFrame = frames[Math.floor(frames.length / 2)];
        if (!mainFrame || !mainFrame.data) {
            mainFrame = frames[frames.length - 1]; // Use last frame as fallback
        }
        const blob = await (await fetch(mainFrame.data)).blob();
        state.currentPhoto = blob;
        state.livePhotoFrames = frames;

        // Show preview with liveness badge
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('previewImage').src = e.target.result;
            hideElement('captureOptions');
            showElement('previewSection');

            // Add liveness badge
            updateLivenessBadge(livenessResult);
        };
        reader.readAsDataURL(blob);

        closeCamera();
    }, captureWindow);
}

function updateLivenessBadge(livenessResult) {
    let badge = document.getElementById('livenessBadge');
    const previewContainer = document.querySelector('.preview-container');

    if (!badge && previewContainer) {
        badge = document.createElement('div');
        badge.id = 'livenessBadge';
        badge.style.cssText = `
            position: absolute; top: 1rem; left: 1rem; padding: 0.5rem 1rem;
            border-radius: 20px; font-size: 0.8rem; font-weight: 600;
            color: white; z-index: 10; backdrop-filter: blur(10px);
        `;
        previewContainer.style.position = 'relative';
        previewContainer.appendChild(badge);
    }

    if (badge) {
        if (livenessResult?.isLive) {
            badge.style.background = 'rgba(16, 185, 129, 0.9)';
            badge.textContent = `✅ Live Photo ${livenessResult.score}%`;
        } else {
            badge.style.background = 'rgba(239, 68, 68, 0.9)';
            badge.textContent = `⚠️ Liveness ${livenessResult?.score || 0}%`;
        }
    }
}

/**
 * Run AI detection on uploaded file and show badge
 */
/**
 * Create timestamp attestation (FREE, replaces blockchain)
 */
async function createTimestampAttestation(certification) {
    try {
        const response = await fetch('/api/timestamp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageHash: certification.imageHash,
                merkleRoot: certification.merkleRoot,
                metadataHash: certification.merkleRoot,
                publicKey: certification.publicKey,
                signatureType: certification.signatureType,
                livenessScore: certification.liveness?.score || 0,
                aiScore: certification.aiDetection?.score || 0
            })
        });

        const data = await response.json();

        if (data.success && data.timestamp) {
            return {
                success: true,
                type: 'timestamp',
                timestamp: data.timestamp.isoTimestamp,
                signature: data.timestamp.signature,
                entryHash: data.timestamp.entryHash,
                logIndex: data.timestamp.logIndex,
                serverSignature: true
            };
        }

        return { success: false };
    } catch (error) {
        console.log('Timestamp attestation error:', error.message);
        return { success: false, error: error.message };
    }
}

// Keep blockchain function as optional
async function createBlockchainAttestation(certification) {
    // Use timestamp service by default (FREE)
    return createTimestampAttestation(certification);
}

/**
 * Get blockchain status
 */
async function getBlockchainStatus() {
    try {
        const response = await fetch('/api/blockchain/status');
        const data = await response.json();
        return data.blockchain || null;
    } catch {
        return null;
    }
}

async function runAIDetectionOnPreview() {
    if (!state.currentPhoto || !window.AIDetector) return;

    const previewContainer = document.querySelector('.preview-container');
    if (!previewContainer) return;

    // Create or get AI badge
    let aiBadge = document.getElementById('aiBadge');
    if (!aiBadge) {
        aiBadge = document.createElement('div');
        aiBadge.id = 'aiBadge';
        aiBadge.style.cssText = `
            position: absolute; top: 1rem; right: 1rem; padding: 0.5rem 1rem;
            border-radius: 20px; font-size: 0.8rem; font-weight: 600;
            color: white; z-index: 10; backdrop-filter: blur(10px);
            background: rgba(107, 114, 128, 0.9);
        `;
        previewContainer.style.position = 'relative';
        previewContainer.appendChild(aiBadge);
    }

    aiBadge.textContent = '🤖 Analyzing...';
    aiBadge.style.background = 'rgba(107, 114, 128, 0.9)';

    try {
        const result = await AIDetector.analyze(state.currentPhoto);
        state.aiDetectionResult = result;

        if (result.isAI) {
            aiBadge.style.background = 'rgba(239, 68, 68, 0.9)';
            aiBadge.textContent = `⚠️ AI Detected ${result.confidence}%`;
        } else {
            aiBadge.style.background = 'rgba(16, 185, 129, 0.9)';
            aiBadge.textContent = `✅ Real ${result.overall}%`;
        }
    } catch (err) {
        aiBadge.textContent = '🤖 N/A';
        console.log('AI detection failed:', err.message);
    }
}

// =====================================
// File Upload
// =====================================

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    state.currentPhoto = file;
    state.livePhotoFrames = null; // Not a live photo
    state.livenessResult = null;
    showPreview(file);

    // Run AI detection on uploaded file
    setTimeout(() => runAIDetectionOnPreview(), 100);

    event.target.value = ''; // Reset input
}

function showPreview(imageBlob) {
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        hideElement('captureOptions');
        showElement('previewSection');
    };
    reader.readAsDataURL(imageBlob);
}

function retakePhoto() {
    state.currentPhoto = null;
    hideElement('previewSection');
    showElement('captureOptions');

    // Also close iPhone-style preview sheet
    const previewSheet = document.getElementById('previewSheet');
    if (previewSheet) {
        previewSheet.classList.remove('active');
    }
}

// =====================================
// Photo Certification (with Real ZK)
// =====================================

async function certifyPhoto() {
    if (!state.currentPhoto) {
        showToast('No photo to certify', 'error');
        return;
    }

    if (!state.cryptoReady) {
        showToast('Crypto not ready, please refresh', 'error');
        return;
    }

    hideElement('previewSection');

    // Also close iPhone-style preview sheet
    const previewSheet = document.getElementById('previewSheet');
    if (previewSheet) {
        previewSheet.classList.remove('active');
    }

    // Show processing - support both old and new UI
    const processingSection = document.getElementById('processingSection');
    if (processingSection) {
        processingSection.classList.add('active');
        processingSection.style.display = 'flex';
    }

    // Reset step badges (support both old and new class names)
    ['step1', 'step2', 'step3', 'step4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.className = el.className.includes('processing-step') ? 'processing-step' : 'step-badge';
        }
    });

    // Reset iOS-style progress ring
    if (typeof window.updateProgressRing === 'function') {
        window.updateProgressRing(0);
    }

    // Get the appropriate crypto module (WebAuthn or TrueShotCrypto)
    const crypto = getCryptoModule();
    const isWebAuthn = state.useWebAuthn && window.WebAuthnCrypto?.isRegistered();

    try {
        // Step 0: Run on-device AI detection
        updateProgress(5, '🤖 Running AI detection (on-device)...');
        let aiDetectionResult = null;
        if (window.AIDetector) {
            try {
                aiDetectionResult = await AIDetector.analyze(state.currentPhoto);
                state.aiDetectionResult = aiDetectionResult;

                if (aiDetectionResult.isAI) {
                    showToast(`⚠️ AI/Fake detected (${aiDetectionResult.confidence}% confidence)`, 'warning');
                } else {
                    showToast(`✅ Appears authentic (${aiDetectionResult.overall}%)`, 'success');
                }
                console.log('🤖 AI Detection:', aiDetectionResult);
            } catch (err) {
                console.log('AI detection skipped:', err.message);
            }
        }

        // Step 1: Capture comprehensive metadata
        updateProgress(15, 'Capturing device metadata...');
        const metadata = await TrueShotCrypto.captureMetadata(); // Always use TrueShotCrypto for metadata
        console.log('📋 Metadata captured:', metadata);

        // Step 2: Get image buffer
        updateProgress(25, 'Computing SHA-256 hash...');
        const imageBuffer = await state.currentPhoto.arrayBuffer();
        const imageHash = await computeImageHash(state.currentPhoto);

        // Step 3: Create cryptographically signed claim
        updateProgress(40, 'Building Merkle tree (1024 tiles)...');

        if (isWebAuthn) {
            updateProgress(55, '🔐 Signing with biometric (WebAuthn)...');
            showToast('Authenticate to sign photo...', 'info');
        } else {
            updateProgress(55, 'Signing with ECDSA P-256...');
        }

        const signedClaim = await crypto.createSignedClaim(imageBuffer, metadata);
        console.log('✍️ Signed claim created:', signedClaim.imageRoot.substring(0, 32) + '...');

        let certification = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            imageData: await blobToBase64(state.currentPhoto),
            merkleRoot: signedClaim.imageRoot,
            imageHash: imageHash,
            signature: signedClaim.signature,
            publicKey: signedClaim.publicKey,
            c2paClaim: signedClaim,
            metadata: metadata,
            status: 'signed',
            confidence: isWebAuthn ? 85 : 70, // Higher confidence for WebAuthn (hardware-backed)
            zkProof: null,
            backendVerified: false,
            liveness: state.livenessResult || null,
            livePhotoFrameCount: state.livePhotoFrames?.length || 0,
            signatureType: isWebAuthn ? 'webauthn' : 'webcrypto',
            biometricVerified: isWebAuthn && signedClaim.biometricVerified,
            aiDetection: aiDetectionResult ? {
                isAI: aiDetectionResult.isAI,
                score: aiDetectionResult.overall,
                confidence: aiDetectionResult.confidence,
                checks: aiDetectionResult.checks,
                processingTime: aiDetectionResult.processingTime,
                analyzedOnDevice: true
            } : null
        };

        // Step 4: Submit to backend for verification
        if (state.backendOnline) {
            updateProgress(70, '🔐 Verifying signature & generating proof...');

            try {
                const backendResult = await submitToBackend(certification);
                console.log('📡 Backend result:', backendResult);

                if (backendResult.success) {
                    certification.backendVerified = true;

                    // Check signature verification
                    if (backendResult.signatureValid) {
                        certification.confidence = 95;
                        certification.status = 'verified';
                        updateProgress(85, '✅ Signature verified!');
                    }

                    // Check for ZK proofs
                    if (backendResult.zkProofs && backendResult.zkProofs.length > 0) {
                        certification.zkProof = backendResult.zkProofs[0];
                        certification.status = 'zk-certified';
                        certification.confidence = 99;
                        state.stats.zkProofs++;
                        updateProgress(90, '✅ ZK Proof generated!');
                    }

                    // Blockchain attestation
                    if (backendResult.blockchain) {
                        certification.attestationId = backendResult.blockchain.attestationId;
                    }

                    // Verification share code
                    if (backendResult.verification) {
                        certification.shareCode = backendResult.verification.shareCode;
                        certification.shareUrl = backendResult.verification.shareUrl;
                        console.log('📋 Share code:', certification.shareCode);
                    }

                    // Create timestamp attestation (FREE)
                    updateProgress(92, '🕐 Creating signed timestamp...');
                    try {
                        const timestampResult = await createTimestampAttestation(certification);
                        if (timestampResult.success) {
                            certification.timestampProof = timestampResult;
                            certification.confidence = Math.min(99, certification.confidence + 2);
                            console.log('🕐 Timestamp attestation:', timestampResult);
                        }
                    } catch (tsErr) {
                        console.log('Timestamp attestation skipped:', tsErr.message);
                    }
                } else {
                    certification.status = 'pending-verification';
                }
            } catch (error) {
                console.log('Backend verification failed:', error.message);
                certification.status = 'local-signed';
            }
        } else {
            updateProgress(70, '⚠️ Offline mode - local signing...');
            certification.status = 'local-signed';
        }

        updateProgress(100, 'Complete!');

        // Save to state and storage
        state.photos.push(certification);
        state.stats.totalCertified++;
        savePhotosToStorage();
        updateStats();

        // Show success
        setTimeout(() => {
            hideElement('processingSection');
            showSuccess(certification);
            switchTab('gallery');
        }, 500);

    } catch (error) {
        console.error('Certification error:', error);
        showToast('Certification failed: ' + error.message, 'error');
        hideElement('processingSection');
        retakePhoto();
    }
}

async function submitToBackend(certification) {
    const formData = new FormData();

    const imageBlob = await base64ToBlob(certification.imageData);
    formData.append('img_buffer', imageBlob, 'photo.jpg');

    // Send the cryptographic signature and public key
    formData.append('signature', certification.signature);
    formData.append('public_key', certification.publicKey);

    // Send full C2PA claim with signature
    formData.append('c2pa_claim', JSON.stringify({
        imageRoot: certification.merkleRoot,
        signature: certification.signature,
        publicKey: certification.publicKey,
        timestamp: certification.timestamp,
        algorithm: certification.signatureType === 'webauthn' ? 'ES256-WebAuthn' : 'ES256',
        tileCount: 1024,
        claimGenerator: certification.c2paClaim?.claimGenerator || 'TrueShot Web',
        signatureType: certification.signatureType,
        biometricVerified: certification.biometricVerified,
        authenticatorData: certification.c2paClaim?.authenticatorData // WebAuthn-specific
    }));

    // Send comprehensive metadata
    formData.append('proof_metadata', JSON.stringify(certification.metadata));
    formData.append('fast_proofs', 'true');
    formData.append('signature_type', certification.signatureType || 'webcrypto');

    const response = await fetch(CONFIG.ENDPOINTS.prove, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Backend submission failed');
    }

    return await response.json();
}

// =====================================
// Cryptographic Functions
// =====================================

async function computeImageHash(photo) {
    const buffer = await photo.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return arrayBufferToHex(hashBuffer);
}

async function computeMerkleRoot(photo) {
    // Split image into tiles and compute Merkle root
    const buffer = await photo.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    // Simulate 1024 tile Merkle tree
    const tileSize = Math.ceil(data.length / 1024);
    const tileHashes = [];
    
    for (let i = 0; i < 1024; i++) {
        const start = i * tileSize;
        const end = Math.min(start + tileSize, data.length);
        const tileData = data.slice(start, end);
        
        if (tileData.length > 0) {
            const hash = await crypto.subtle.digest('SHA-256', tileData);
            tileHashes.push(new Uint8Array(hash));
        } else {
            // Empty tile - use zero hash
            tileHashes.push(new Uint8Array(32));
        }
    }
    
    // Build tree up to root
    let level = tileHashes;
    while (level.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = level[i + 1] || left;
            const combined = new Uint8Array(left.length + right.length);
            combined.set(left);
            combined.set(right, left.length);
            const hash = await crypto.subtle.digest('SHA-256', combined);
            nextLevel.push(new Uint8Array(hash));
        }
        level = nextLevel;
    }
    
    return arrayBufferToHex(level[0].buffer);
}

async function generateSignature(photo, metadata) {
    const data = await photo.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', data);
    return arrayBufferToHex(hash);
}

async function generatePhotoMetadata(photo) {
    const metadata = {
        timestamp: new Date().toISOString(),
        deviceId: await getDeviceId(),
        deviceType: getDeviceType(),
        browser: getBrowserInfo(),
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio,
        colorDepth: window.screen.colorDepth,
        imageSize: photo.size,
        platform: navigator.platform,
        language: navigator.language
    };
    
    // Try GPS
    if (navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000,
                    maximumAge: 0,
                    enableHighAccuracy: true
                });
            });
            
            metadata.latitude = position.coords.latitude;
            metadata.longitude = position.coords.longitude;
            metadata.accuracy = position.coords.accuracy;
            metadata.altitude = position.coords.altitude;
        } catch (error) {
            console.log('GPS not available');
        }
    }
    
    // Try device orientation
    if (window.DeviceOrientationEvent) {
        try {
            const orientation = await new Promise((resolve) => {
                const handler = (event) => {
                    window.removeEventListener('deviceorientation', handler);
                    resolve(event);
                };
                window.addEventListener('deviceorientation', handler);
                setTimeout(() => resolve(null), 1000);
            });
            
            if (orientation) {
                metadata.alpha = orientation.alpha;
                metadata.beta = orientation.beta;
                metadata.gamma = orientation.gamma;
            }
        } catch (error) {}
    }
    
    return metadata;
}

function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile';
    return 'desktop';
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
}

async function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = generateRandomString(32);
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// =====================================
// Gallery Management
// =====================================

function updateGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    if (state.photos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">📷</div>
                <div class="empty-title">No Photos Yet</div>
                <div class="empty-text">Capture your first verified photo</div>
            </div>
        `;
        return;
    }

    // Determine if using new iOS-style UI based on existing class structure
    const isNewUI = grid.classList.contains('gallery-grid');

    if (isNewUI) {
        // New iPhone-style gallery grid
        grid.innerHTML = state.photos.map(photo => `
            <div class="gallery-item" onclick="showPhotoDetails('${photo.id}')">
                <img src="${photo.imageData}" alt="Verified photo">
                <div class="gallery-item-badge">${photo.zkProof ? '🔐' : '✓'}</div>
            </div>
        `).join('');
    } else {
        // Old UI gallery
        grid.innerHTML = state.photos.map(photo => `
            <div class="gallery-item" onclick="showPhotoDetails('${photo.id}')">
                <img src="${photo.imageData}" alt="Certified photo">
                <div class="gallery-badge ${photo.zkProof ? 'zk' : ''}">
                    ${photo.zkProof ? '🔐 ZK' : '✓'} Verified
                </div>
            </div>
        `).join('');
    }
}

// Make loadGallery available globally for iOS UI
window.loadGallery = function() {
    updateGallery();
};

function showPhotoDetails(photoId) {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;
    
    const modal = document.getElementById('photoModal');
    const body = document.getElementById('modalBody');
    
    const zkStatus = photo.zkProof
        ? '<span class="detail-value success">✅ ZK Proof Generated (Groth16)</span>'
        : photo.backendVerified
            ? '<span class="detail-value success">✅ Backend Verified</span>'
            : '<span class="detail-value" style="color: #f59e0b;">⚠️ Local Only</span>';

    const signatureStatus = photo.signatureType === 'webauthn'
        ? '<span class="detail-value success">🔐 Hardware Security (WebAuthn)</span>'
        : '<span class="detail-value">🔑 Software Keys (Web Crypto)</span>';

    const aiStatus = photo.aiDetection
        ? (photo.aiDetection.isAI
            ? `<span class="detail-value" style="color: #ef4444;">⚠️ Likely AI/Fake (${photo.aiDetection.confidence}%)</span>`
            : `<span class="detail-value success">✅ Appears Authentic (${photo.aiDetection.score}%)</span>`)
        : '<span class="detail-value" style="color: #6b7280;">Not analyzed</span>';

    const livenessStatus = photo.liveness
        ? (photo.liveness.isLive
            ? `<span class="detail-value success">✅ Live Scene (${photo.liveness.score}%)</span>`
            : `<span class="detail-value" style="color: #f59e0b;">⚠️ Possible Screen (${photo.liveness.score}%)</span>`)
        : '<span class="detail-value" style="color: #6b7280;">Not checked</span>';

    body.innerHTML = `
        <img src="${photo.imageData}" class="modal-image" alt="Photo">

        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Status</div>
                <div class="detail-value success">
                    ${photo.status === 'zk-certified' ? '🔐 ZK Certified' : '✅ Certified'}
                </div>
            </div>

            <div class="detail-item">
                <div class="detail-label">🤖 AI Detection (On-Device)</div>
                ${aiStatus}
            </div>

            <div class="detail-item">
                <div class="detail-label">📸 Liveness Check</div>
                ${livenessStatus}
            </div>

            <div class="detail-item">
                <div class="detail-label">Signature Security</div>
                ${signatureStatus}
            </div>

            <div class="detail-item">
                <div class="detail-label">Zero-Knowledge Proof</div>
                ${zkStatus}
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Confidence Score</div>
                <div class="detail-value">${photo.confidence}%</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Merkle Root (1024 tiles)</div>
                <div class="detail-value mono">${photo.merkleRoot}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Image Hash (SHA-256)</div>
                <div class="detail-value mono">${photo.imageHash || photo.signature}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value">${new Date(photo.timestamp).toLocaleString()}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">Device</div>
                <div class="detail-value">${photo.metadata.deviceType} / ${photo.metadata.browser}</div>
            </div>
            
            ${photo.metadata.latitude ? `
            <div class="detail-item">
                <div class="detail-label">GPS Location</div>
                <div class="detail-value">${photo.metadata.latitude.toFixed(6)}, ${photo.metadata.longitude.toFixed(6)}</div>
            </div>
            ` : ''}
            
            ${photo.timestampProof ? `
            <div class="detail-item" style="grid-column: 1 / -1; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1)); padding: 1rem; border-radius: 12px; margin-top: 0.5rem;">
                <div class="detail-label" style="color: #10b981; font-size: 1rem; margin-bottom: 0.5rem;">🕐 Timestamp Proof (Signed)</div>
                <div style="display: grid; gap: 0.5rem;">
                    <div><span style="color: #9ca3af;">Timestamp:</span> <span style="color: #10b981;">${new Date(photo.timestampProof.timestamp).toLocaleString()}</span></div>
                    <div><span style="color: #9ca3af;">Log Entry:</span> <span style="color: #06b6d4;">#${photo.timestampProof.logIndex}</span></div>
                    <div><span style="color: #9ca3af;">Entry Hash:</span> <span class="mono" style="font-size: 0.7rem;">${photo.timestampProof.entryHash?.substring(0, 24)}...</span></div>
                    <div><span style="color: #9ca3af;">Server Signed:</span> <span style="color: #10b981;">✅ ECDSA P-256</span></div>
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 0.75rem; color: #9ca3af;">
                        💡 This timestamp is cryptographically signed and recorded in an auditable transparency log. Anyone can verify it.
                    </div>
                </div>
            </div>
            ` : photo.blockchain ? `
            <div class="detail-item" style="grid-column: 1 / -1; background: linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(6, 182, 212, 0.1)); padding: 1rem; border-radius: 12px; margin-top: 0.5rem;">
                <div class="detail-label" style="color: #a78bfa; font-size: 1rem; margin-bottom: 0.5rem;">⛓️ Blockchain Attestation</div>
                <div style="display: grid; gap: 0.5rem;">
                    <div><span style="color: #9ca3af;">Chain:</span> <span style="color: #10b981;">${photo.blockchain.chain || 'Base'}</span></div>
                    <div><span style="color: #9ca3af;">Status:</span> <span style="color: ${photo.blockchain.onChain ? '#10b981' : '#f59e0b'};">${photo.blockchain.onChain ? '✅ Confirmed' : '⏳ Pending'}</span></div>
                </div>
            </div>
            ` : ''}
        </div>
        
        <div class="modal-actions">
            <button class="btn btn-primary" onclick="sharePhoto('${photo.id}')">
                <span>📤</span>
                <span>Share</span>
            </button>
            <button class="btn btn-secondary" onclick="downloadPhoto('${photo.id}')">
                <span>💾</span>
                <span>Download</span>
            </button>
            <button class="btn btn-secondary" onclick="deletePhoto('${photo.id}')" style="border-color: var(--error);">
                <span>🗑️</span>
            </button>
        </div>
    `;
    
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('photoModal').classList.remove('active');
}

// =====================================
// Photo Actions
// =====================================

async function sharePhoto(photoId) {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;
    
    try {
        const blob = await base64ToBlob(photo.imageData);
        const file = new File([blob], `certified-${photoId}.jpg`, { type: 'image/jpeg' });
        
        if (navigator.share) {
            await navigator.share({
                title: 'ZK Certified Photo',
                text: `Certified with ${photo.confidence}% confidence. Merkle Root: ${photo.merkleRoot.substring(0, 16)}...`,
                files: [file]
            });
        } else {
            showToast('Sharing not supported on this device', 'error');
        }
    } catch (error) {
        showToast('Share cancelled', 'info');
    }
}

function downloadPhoto(photoId) {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;
    
    const link = document.createElement('a');
    link.href = photo.imageData;
    link.download = `zk-certified-${photoId}.jpg`;
    link.click();
    
    showToast('Photo downloaded', 'success');
}

function deletePhoto(photoId) {
    if (!confirm('Delete this certified photo?')) return;
    
    state.photos = state.photos.filter(p => p.id !== photoId);
    savePhotosToStorage();
    updateGallery();
    updateStats();
    closeModal();
    
    showToast('Photo deleted', 'success');
}

// =====================================
// Verification
// =====================================

async function handleVerifyUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    // Show processing UI
    hideElement('verifyOptions');
    showElement('verifyProcessing');
    hideElement('verifyResults');

    try {
        document.getElementById('verifyProcessingText').textContent = 'Uploading media...';

        // Upload to verification API
        const formData = new FormData();
        formData.append('media', file);

        document.getElementById('verifyProcessingText').textContent = 'Checking attestation database...';

        const response = await fetch('/api/verify/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        hideElement('verifyProcessing');
        showComprehensiveVerificationResult(result.verification);

    } catch (error) {
        hideElement('verifyProcessing');
        showVerificationError(error.message);
    }
}

// Verify by share code
async function verifyByShareCode() {
    const code = document.getElementById('shareCodeInput').value.trim().toUpperCase();
    if (!code) {
        showToast('Please enter a share code', 'error');
        return;
    }

    hideElement('verifyOptions');
    showElement('verifyProcessing');
    document.getElementById('verifyProcessingText').textContent = 'Looking up attestation...';

    try {
        const response = await fetch(`/api/verify/link/${code}`);
        const result = await response.json();

        hideElement('verifyProcessing');

        if (result.success) {
            showComprehensiveVerificationResult({
                verified: true,
                confidence: 100,
                checks: [
                    { name: 'share_code', passed: true, message: 'Valid share code' },
                    { name: 'attestation', passed: true, message: 'Attestation found in database' }
                ],
                attestation: result.verification.attestation
            });
        } else {
            showVerificationError('Share code not found. The media may not have been captured through TrueShot.');
        }
    } catch (error) {
        hideElement('verifyProcessing');
        showVerificationError(error.message);
    }
}

function showComprehensiveVerificationResult(verification) {
    const resultsDiv = document.getElementById('verifyResults');
    resultsDiv.classList.remove('hidden');

    const isVerified = verification.verified;
    const confidence = verification.confidence || 0;
    const checks = verification.checks || [];
    const attestation = verification.attestation;

    let checksHTML = checks.map(check => `
        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: ${check.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border-radius: 8px; margin-bottom: 0.5rem;">
            <span style="font-size: 1.25rem;">${check.passed ? '✅' : '❌'}</span>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.875rem;">${check.name.replace(/_/g, ' ').toUpperCase()}</div>
                <div style="color: var(--text-secondary); font-size: 0.8rem;">${check.message}</div>
            </div>
        </div>
    `).join('');

    let attestationHTML = '';
    if (attestation) {
        attestationHTML = `
            <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border);">
                <div style="font-weight: 600; margin-bottom: 1rem; color: var(--text-primary);">Attestation Details</div>
                <div class="detail-grid">
                    ${attestation.captureProof?.timestamp ? `
                    <div class="detail-item">
                        <div class="detail-label">Capture Time</div>
                        <div class="detail-value">${new Date(attestation.captureProof.timestamp).toLocaleString()}</div>
                    </div>
                    ` : ''}
                    ${attestation.locationProof ? `
                    <div class="detail-item">
                        <div class="detail-label">Location</div>
                        <div class="detail-value">${attestation.locationProof.latitude.toFixed(4)}, ${attestation.locationProof.longitude.toFixed(4)}</div>
                    </div>
                    ` : ''}
                    ${attestation.deviceProof ? `
                    <div class="detail-item">
                        <div class="detail-label">Device</div>
                        <div class="detail-value">${attestation.deviceProof.type} / ${attestation.deviceProof.browser}</div>
                    </div>
                    ` : ''}
                    ${attestation.videoProof ? `
                    <div class="detail-item">
                        <div class="detail-label">Video Frames</div>
                        <div class="detail-value">${attestation.videoProof.frameCount} frames</div>
                    </div>
                    ` : ''}
                    ${attestation.integrityProof?.merkleRoot ? `
                    <div class="detail-item">
                        <div class="detail-label">Merkle Root</div>
                        <div class="detail-value mono">${attestation.integrityProof.merkleRoot}</div>
                    </div>
                    ` : ''}
                    <div class="detail-item">
                        <div class="detail-label">Verification Count</div>
                        <div class="detail-value">${attestation.verificationCount || 1} time(s)</div>
                    </div>
                </div>
            </div>
        `;
    }

    resultsDiv.innerHTML = `
        <div class="verify-result ${isVerified ? 'success' : 'fail'}">
            <div class="verify-icon">${isVerified ? '✅' : '❌'}</div>
            <div class="verify-title">${isVerified ? 'AUTHENTIC' : 'NOT VERIFIED'}</div>
            <p style="color: var(--text-secondary);">
                ${isVerified
                    ? 'This media was captured through TrueShot and is authentic.'
                    : 'This media could not be verified. It may be fake or modified.'}
            </p>
            ${isVerified ? `<div style="margin-top: 1rem; font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${confidence}% Confidence</div>` : ''}
        </div>

        <div style="margin-top: 1.5rem;">
            <div style="font-weight: 600; margin-bottom: 0.75rem;">Verification Checks</div>
            ${checksHTML}
        </div>

        ${attestationHTML}

        ${!isVerified && verification.details?.possibleReasons ? `
        <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
            <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--error);">Possible Reasons</div>
            <ul style="color: var(--text-secondary); font-size: 0.875rem; margin: 0; padding-left: 1.25rem;">
                ${verification.details.possibleReasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div style="margin-top: 1.5rem;">
            <button class="btn btn-secondary" onclick="resetVerification()" style="width: 100%;">
                <span>🔄</span>
                <span>Verify Another</span>
            </button>
        </div>
    `;
}

function showVerificationError(message) {
    const resultsDiv = document.getElementById('verifyResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
        <div class="verify-result fail">
            <div class="verify-icon">❌</div>
            <div class="verify-title">Verification Failed</div>
            <p style="color: var(--text-secondary);">${message}</p>
        </div>
        <div style="margin-top: 1.5rem;">
            <button class="btn btn-secondary" onclick="resetVerification()" style="width: 100%;">
                <span>🔄</span>
                <span>Try Again</span>
            </button>
        </div>
    `;
}

function resetVerification() {
    showElement('verifyOptions');
    hideElement('verifyProcessing');
    hideElement('verifyResults');
    document.getElementById('shareCodeInput').value = '';
}

function showVerificationResult(photo, isAuthentic) {
    const resultsDiv = document.getElementById('verifyResults');
    
    if (isAuthentic && photo) {
        resultsDiv.innerHTML = `
            <div class="verify-result success">
                <div class="verify-icon">✅</div>
                <div class="verify-title">AUTHENTIC</div>
                <p style="color: var(--text-secondary);">This photo is cryptographically verified</p>
            </div>
            
            <div class="detail-grid" style="margin-top: 1.5rem;">
                <div class="detail-item">
                    <div class="detail-label">Confidence</div>
                    <div class="detail-value success">${photo.confidence}%</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">ZK Proof</div>
                    <div class="detail-value ${photo.zkProof ? 'success' : ''}">${photo.zkProof ? '✅ Valid' : '⚠️ Not Available'}</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">Merkle Root</div>
                    <div class="detail-value mono">${photo.merkleRoot?.substring(0, 32)}...</div>
                </div>
                
                <div class="detail-item">
                    <div class="detail-label">Certified</div>
                    <div class="detail-value">${new Date(photo.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `;
    } else {
        resultsDiv.innerHTML = `
            <div class="verify-result fail">
                <div class="verify-icon">❌</div>
                <div class="verify-title">NOT VERIFIED</div>
                <p style="color: var(--text-secondary);">This photo could not be verified</p>
            </div>
            
            <div style="margin-top: 1.5rem; padding: 1rem; background: var(--glass); border-radius: 12px; border: 1px solid var(--glass-border);">
                <p style="color: var(--text-secondary); font-size: 0.875rem;">
                    <strong>Possible reasons:</strong><br>
                    • Photo was not certified through this system<br>
                    • Photo has been modified after certification<br>
                    • Could be a fraudulent or AI-generated image
                </p>
            </div>
        `;
    }
}

// =====================================
// Stats Management
// =====================================

function updateStats() {
    document.getElementById('totalCertified').textContent = state.stats.totalCertified;
    document.getElementById('zkProofs').textContent = state.stats.zkProofs;
    document.getElementById('successRate').textContent = state.stats.successRate + '%';
    document.getElementById('fraudPrevented').textContent = state.stats.fraudPrevented;
}

// =====================================
// UI Helpers
// =====================================

function updateProgress(percent, text) {
    // Old UI: progress bar
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }

    // New UI: iOS-style progress ring
    if (typeof window.updateProgressRing === 'function') {
        window.updateProgressRing(percent);
    }

    // Update processing text
    const processingText = document.getElementById('processingText');
    if (processingText) {
        processingText.textContent = text;
    }

    // Update step badges (support both old and new UI class names)
    const steps = ['step1', 'step2', 'step3', 'step4'];
    steps.forEach((step, index) => {
        const el = document.getElementById(step);
        if (el) {
            // Detect which UI based on existing class
            const isNewUI = el.className.includes('processing-step');
            const baseClass = isNewUI ? 'processing-step' : 'step-badge';

            if (percent > (index + 1) * 25) {
                el.className = baseClass + ' done';
            } else if (percent > index * 25) {
                el.className = baseClass + ' active';
            } else {
                el.className = baseClass;
            }
        }
    });
}

function showSuccess(certification) {
    const zkText = certification.zkProof ? 'with ZK Proof!' : '';
    showToast(`Photo certified ${zkText} 🎉`, 'success');
    createConfetti();

    // Show share code modal if available
    if (certification.shareCode) {
        setTimeout(() => {
            showShareCodeModal(certification.shareCode);
        }, 1500);
    }
}

function showShareCodeModal(shareCode) {
    // Create modal for share code
    const modal = document.createElement('div');
    modal.id = 'shareCodeModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); display: flex; align-items: center;
        justify-content: center; z-index: 9999; padding: 1rem;
    `;
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 20px; padding: 2rem; max-width: 400px; width: 100%; text-align: center;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">📋</div>
            <h2 style="margin-bottom: 0.5rem; color: var(--text-primary);">Share Code Created!</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                Anyone with this code can verify your photo is authentic
            </p>
            <div style="background: var(--bg-main); border: 2px dashed var(--primary); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
                <div style="font-size: 2rem; font-weight: 800; letter-spacing: 4px; font-family: monospace; color: var(--primary);">${shareCode}</div>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button onclick="copyShareCode('${shareCode}')" class="btn btn-primary" style="flex: 1;">
                    <span>📋</span> Copy Code
                </button>
                <button onclick="closeShareCodeModal()" class="btn btn-secondary" style="flex: 1;">
                    <span>✓</span> Done
                </button>
            </div>
            <p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 1rem;">
                Recipients can verify at the Verify tab
            </p>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShareCodeModal();
    });
}

function copyShareCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showToast('Share code copied!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function closeShareCodeModal() {
    const modal = document.getElementById('shareCodeModal');
    if (modal) modal.remove();
}

// =====================================
// WebAuthn Setup
// =====================================

function showWebAuthnSetupPrompt() {
    const modal = document.createElement('div');
    modal.id = 'webauthnSetupModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.9); display: flex; align-items: center;
        justify-content: center; z-index: 9999; padding: 1rem;
    `;
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 20px; padding: 2rem; max-width: 400px; width: 100%; text-align: center;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🔐</div>
            <h2 style="margin-bottom: 0.5rem; color: var(--text-primary);">Enable Biometric Security</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
                Use Face ID, fingerprint, or device PIN to sign your photos.
                This is the most secure option - your private key never leaves your device.
            </p>
            <div style="background: rgba(16, 185, 129, 0.1); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; text-align: left;">
                <div style="font-weight: 600; color: var(--success); margin-bottom: 0.5rem;">Benefits:</div>
                <ul style="color: var(--text-secondary); font-size: 0.85rem; margin: 0; padding-left: 1.25rem;">
                    <li>Private key stored in Secure Enclave/TPM</li>
                    <li>Requires biometric verification to sign</li>
                    <li>Key cannot be extracted or copied</li>
                    <li>Strongest proof of authenticity</li>
                </ul>
            </div>
            <div style="display: flex; gap: 0.75rem; flex-direction: column;">
                <button onclick="setupWebAuthn()" class="btn btn-primary" style="width: 100%;">
                    <span>👆</span> Enable Biometric Security
                </button>
                <button onclick="skipWebAuthn()" class="btn btn-secondary" style="width: 100%;">
                    Skip for now
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function setupWebAuthn() {
    const modal = document.getElementById('webauthnSetupModal');

    try {
        showToast('Setting up biometric security...', 'info');

        const result = await WebAuthnCrypto.register('TrueShot User');

        if (result.success) {
            state.cryptoReady = true;
            state.useWebAuthn = true;

            showToast('Biometric security enabled!', 'success');

            if (modal) modal.remove();

            // Show success
            createConfetti();
        } else {
            showToast('Setup failed: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('WebAuthn setup error:', error);
        showToast('Setup failed: ' + error.message, 'error');
    }
}

function skipWebAuthn() {
    const modal = document.getElementById('webauthnSetupModal');
    if (modal) modal.remove();

    // Fall back to Web Crypto
    TrueShotCrypto.init().then(() => {
        state.cryptoReady = true;
        console.log('🔐 Using Web Crypto (software keys)');
        showToast('Using standard security', 'info');
    });
}

/**
 * Get the appropriate crypto module (WebAuthn or fallback)
 */
function getCryptoModule() {
    if (state.useWebAuthn && window.WebAuthnCrypto?.isRegistered()) {
        return WebAuthnCrypto;
    }
    return TrueShotCrypto;
}

function createConfetti() {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.top = '-10px';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }, i * 20);
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMessage');
    
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    
    icon.textContent = icons[type] || icons.info;
    text.textContent = message;
    
    toast.className = 'toast ' + type;
    toast.classList.add('show');
    
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// =====================================
// Storage
// =====================================

function savePhotosToStorage() {
    try {
        localStorage.setItem('rialPhotos', JSON.stringify(state.photos));
        localStorage.setItem('rialStats', JSON.stringify(state.stats));
    } catch (error) {
        console.error('Storage error:', error);
        showToast('Storage quota exceeded', 'warning');
    }
}

function loadPhotosFromStorage() {
    try {
        const photos = localStorage.getItem('rialPhotos');
        const stats = localStorage.getItem('rialStats');
        
        if (photos) state.photos = JSON.parse(photos);
        if (stats) state.stats = JSON.parse(stats);
    } catch (error) {
        console.error('Load error:', error);
    }
}

// =====================================
// Utilities
// =====================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64) {
    return fetch(base64).then(r => r.blob());
}

// =====================================
// Debug Console
// =====================================

window.RialApp = {
    state,
    CONFIG,
    checkBackendStatus,
    updateGallery,
    certifyPhoto,
    clearAll: () => {
        localStorage.clear();
        state.photos = [];
        state.stats = { totalCertified: 0, zkProofs: 0, successRate: 100, fraudPrevented: 0 };
        updateGallery();
        updateStats();
        showToast('All data cleared', 'success');
    }
};

console.log('🔐 Rial Web App Loaded');
console.log('📊 Type RialApp.state to see current state');
console.log('🧹 Type RialApp.clearAll() to reset');

// =====================================
// ZK-IMG Editor Functionality
// =====================================

const editorState = {
    currentImage: null,
    currentImageData: null,
    selectedTool: null,
    transformationQueue: [],
    originalDimensions: { width: 0, height: 0 }
};

function setupEditorListeners() {
    // Edit upload button
    document.getElementById('editUploadBtn').addEventListener('click', () => {
        document.getElementById('editFileInput').click();
    });

    document.getElementById('editFileInput').addEventListener('change', handleEditUpload);

    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => selectTool(btn.dataset.tool));
    });

    // Rotate buttons
    document.querySelectorAll('.tool-btn[data-rotate]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all rotate buttons
            document.querySelectorAll('.tool-btn[data-rotate]').forEach(b => b.classList.remove('active'));
            // Add active to clicked button
            btn.classList.add('active');
        });
    });

    // Brightness slider
    const brightnessSlider = document.getElementById('brightnessSlider');
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            document.getElementById('brightnessValue').textContent = parseFloat(e.target.value).toFixed(1);
        });
    }

    // Apply transformation button
    document.getElementById('applyTransformBtn').addEventListener('click', applyTransformation);

    // Cancel edit button
    document.getElementById('cancelEditBtn').addEventListener('click', resetEditor);

    // Download transformed image
    document.getElementById('downloadTransformedBtn').addEventListener('click', downloadTransformedImage);

    // New edit button
    document.getElementById('newEditBtn').addEventListener('click', resetEditor);

    // Apply chain button
    const applyChainBtn = document.getElementById('applyChainBtn');
    if (applyChainBtn) {
        applyChainBtn.addEventListener('click', applyTransformationChain);
    }
}

function handleEditUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    editorState.currentImage = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        editorState.currentImageData = e.target.result;

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
            editorState.originalDimensions = { width: img.width, height: img.height };
            // Set default resize values
            document.getElementById('resizeWidth').value = img.width;
            document.getElementById('resizeHeight').value = img.height;
            document.getElementById('cropWidth').value = Math.min(100, img.width);
            document.getElementById('cropHeight').value = Math.min(100, img.height);
        };
        img.src = e.target.result;

        document.getElementById('editPreviewImage').src = e.target.result;
        hideElement('editUploadSection');
        showElement('editorSection');
        hideElement('zkProofResult');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function selectTool(tool) {
    editorState.selectedTool = tool;

    // Update button states
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Show tool options
    showElement('toolOptions');

    // Hide all option panels
    document.querySelectorAll('.option-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    // Show selected tool's options
    const optionsPanel = document.getElementById(tool + 'Options');
    if (optionsPanel) {
        optionsPanel.classList.remove('hidden');
    }

    // Handle crop overlay
    const cropOverlay = document.getElementById('cropOverlay');
    if (tool === 'crop') {
        cropOverlay.classList.remove('hidden');
    } else {
        cropOverlay.classList.add('hidden');
    }
}

async function applyTransformation() {
    if (!editorState.currentImage || !editorState.selectedTool) {
        showToast('Please select an image and a transformation', 'error');
        return;
    }

    const tool = editorState.selectedTool;
    let transformation = { type: tool, params: {} };

    // Build transformation params based on tool
    switch (tool) {
        case 'crop':
            transformation.params = {
                x: parseInt(document.getElementById('cropX').value) || 0,
                y: parseInt(document.getElementById('cropY').value) || 0,
                width: parseInt(document.getElementById('cropWidth').value) || 100,
                height: parseInt(document.getElementById('cropHeight').value) || 100
            };
            break;
        case 'resize':
            transformation.params = {
                width: parseInt(document.getElementById('resizeWidth').value) || 800,
                height: parseInt(document.getElementById('resizeHeight').value) || 600
            };
            break;
        case 'grayscale':
            // No params needed
            break;
        case 'brightness':
            transformation.params = {
                factor: parseFloat(document.getElementById('brightnessSlider').value) || 1.0
            };
            break;
        case 'rotate':
            const rotateBtn = document.querySelector('.tool-btn[data-rotate].active');
            transformation.params = {
                angle: rotateBtn ? parseInt(rotateBtn.dataset.rotate) : 90
            };
            break;
    }

    // Show processing state
    hideElement('editorSection');
    showElement('processingSection');
    updateProgress(10, 'Preparing image for transformation...');

    try {
        updateProgress(30, `Applying ${tool} transformation...`);

        // Call ZK-IMG API
        const formData = new FormData();
        formData.append('image', editorState.currentImage);
        formData.append('transformation', JSON.stringify(transformation));
        formData.append('revealOutput', 'true');

        updateProgress(50, 'Generating ZK proof...');

        const response = await fetch('/api/zkimg/transform', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Transformation failed');
        }

        const result = await response.json();

        updateProgress(80, 'Processing complete!');

        // Display result
        setTimeout(() => {
            hideElement('processingSection');
            displayTransformationResult(result, transformation);
        }, 500);

    } catch (error) {
        console.error('Transformation error:', error);
        showToast('Transformation failed: ' + error.message, 'error');
        hideElement('processingSection');
        showElement('editorSection');
    }
}

function displayTransformationResult(result, transformation) {
    // Show proof result section
    showElement('zkProofResult');

    // Update proof details
    document.getElementById('proofInputHash').textContent =
        result.proof?.inputHash?.substring(0, 32) + '...' || 'N/A';
    document.getElementById('proofOutputHash').textContent =
        result.proof?.outputHash?.substring(0, 32) + '...' || 'N/A';
    document.getElementById('proofTransform').textContent =
        `${transformation.type} ${JSON.stringify(transformation.params)}`;
    document.getElementById('proofTime').textContent =
        `${result.proof?.processingTimeMs || 0}ms`;

    // Display transformed image
    if (result.outputImage) {
        const imgSrc = `data:image/jpeg;base64,${result.outputImage}`;
        document.getElementById('transformedImage').src = imgSrc;
        editorState.transformedImageData = imgSrc;
    }

    showToast('Transformation complete with ZK proof!', 'success');
    createConfetti();
}

async function applyTransformationChain() {
    if (!editorState.currentImage || editorState.transformationQueue.length === 0) {
        showToast('Please add transformations to the queue', 'error');
        return;
    }

    hideElement('editorSection');
    showElement('processingSection');
    updateProgress(10, 'Starting transformation chain...');

    try {
        const formData = new FormData();
        formData.append('image', editorState.currentImage);
        formData.append('transformations', JSON.stringify(editorState.transformationQueue));
        formData.append('revealFinal', 'true');

        updateProgress(50, `Applying ${editorState.transformationQueue.length} transformations...`);

        const response = await fetch('/api/zkimg/transform-chain', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Chain transformation failed');
        }

        const result = await response.json();

        updateProgress(90, 'Chain complete!');

        setTimeout(() => {
            hideElement('processingSection');
            displayChainResult(result);
        }, 500);

    } catch (error) {
        console.error('Chain error:', error);
        showToast('Chain failed: ' + error.message, 'error');
        hideElement('processingSection');
        showElement('editorSection');
    }
}

function displayChainResult(result) {
    showElement('zkProofResult');

    document.getElementById('proofInputHash').textContent =
        result.chainProof?.initialHash?.substring(0, 32) + '...' || 'N/A';
    document.getElementById('proofOutputHash').textContent =
        result.chainProof?.finalHash?.substring(0, 32) + '...' || 'N/A';
    document.getElementById('proofTransform').textContent =
        `Chain of ${result.transformationCount} transformations`;
    document.getElementById('proofTime').textContent = 'N/A';

    if (result.finalImage) {
        const imgSrc = `data:image/jpeg;base64,${result.finalImage}`;
        document.getElementById('transformedImage').src = imgSrc;
        editorState.transformedImageData = imgSrc;
    }

    showToast('Transformation chain complete!', 'success');
    createConfetti();
}

function resetEditor() {
    editorState.currentImage = null;
    editorState.currentImageData = null;
    editorState.selectedTool = null;
    editorState.transformationQueue = [];

    showElement('editUploadSection');
    hideElement('editorSection');
    hideElement('zkProofResult');
    hideElement('toolOptions');
    hideElement('cropOverlay');

    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
}

function downloadTransformedImage() {
    if (!editorState.transformedImageData) {
        showToast('No transformed image to download', 'error');
        return;
    }

    const link = document.createElement('a');
    link.href = editorState.transformedImageData;
    link.download = `zk-transformed-${Date.now()}.jpg`;
    link.click();

    showToast('Image downloaded', 'success');
}

// Initialize editor listeners when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEditorListeners);
} else {
    setupEditorListeners();
}

// =====================================
// ZK-Video Functionality
// =====================================

const videoState = {
    stream: null,
    isRecording: false,
    sessionId: null,
    frameCount: 0,
    startTime: null,
    frameInterval: null,
    capturedFrames: [],
    lastAttestation: null
};

function setupVideoListeners() {
    // Mode selection buttons
    document.getElementById('streamingModeBtn')?.addEventListener('click', startLiveRecording);
    document.getElementById('uploadVideoModeBtn')?.addEventListener('click', () => {
        document.getElementById('videoFileInput').click();
    });
    document.getElementById('videoFileInput')?.addEventListener('change', handleVideoUpload);

    // Recording controls
    document.getElementById('closeVideoBtn')?.addEventListener('click', closeVideoRecording);
    document.getElementById('recordBtn')?.addEventListener('click', toggleRecording);
    document.getElementById('stopRecordBtn')?.addEventListener('click', stopRecording);

    // Result actions
    document.getElementById('downloadVideoProofBtn')?.addEventListener('click', downloadVideoProof);
    document.getElementById('newVideoBtn')?.addEventListener('click', resetVideoUI);
}

async function startLiveRecording() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        videoState.stream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoPreview = document.getElementById('videoPreview');
        videoPreview.srcObject = videoState.stream;

        hideElement('videoModeSelect');
        showElement('videoRecordingSection');

        showToast('Camera ready. Press record to start.', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Failed to access camera', 'error');
    }
}

async function toggleRecording() {
    if (videoState.isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        // Start streaming session on backend
        const response = await fetch('/api/zkvideo/stream/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata: { source: 'web', timestamp: Date.now() } })
        });

        const data = await response.json();
        if (!data.success) throw new Error('Failed to start session');

        videoState.sessionId = data.session.sessionId;
        videoState.isRecording = true;
        videoState.startTime = Date.now();
        videoState.frameCount = 0;

        // Update UI
        showElement('recordingBadge');
        hideElement('recordBtn');
        showElement('stopRecordBtn');
        document.getElementById('videoStatus').textContent = 'Recording';

        // Start capturing frames (2 fps for keyframes)
        videoState.frameInterval = setInterval(captureAndAttestFrame, 500);

        showToast('Recording started with ZK attestation', 'success');
    } catch (error) {
        console.error('Start recording error:', error);
        showToast('Failed to start recording: ' + error.message, 'error');
    }
}

async function captureAndAttestFrame() {
    if (!videoState.isRecording || !videoState.stream) return;

    try {
        const videoPreview = document.getElementById('videoPreview');
        const canvas = document.createElement('canvas');
        canvas.width = videoPreview.videoWidth;
        canvas.height = videoPreview.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoPreview, 0, 0);

        const frameData = canvas.toDataURL('image/jpeg', 0.7);
        const timestamp = Date.now() - videoState.startTime;

        // Send frame to backend for attestation
        const response = await fetch(`/api/zkvideo/stream/${videoState.sessionId}/frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                frame: { data: frameData, timestamp }
            })
        });

        const result = await response.json();
        if (result.success) {
            videoState.frameCount++;
            updateVideoStats();
        }
    } catch (error) {
        console.error('Frame capture error:', error);
    }
}

function updateVideoStats() {
    const duration = videoState.startTime ? Date.now() - videoState.startTime : 0;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    document.getElementById('videoDuration').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('videoFrames').textContent = videoState.frameCount;
    document.getElementById('frameCountBadge').textContent = `${videoState.frameCount} frames`;
}

async function stopRecording() {
    if (!videoState.isRecording) return;

    clearInterval(videoState.frameInterval);
    videoState.isRecording = false;

    // Update UI
    hideElement('recordingBadge');
    document.getElementById('videoStatus').textContent = 'Processing...';

    try {
        // End streaming session
        const response = await fetch(`/api/zkvideo/stream/${videoState.sessionId}/end`, {
            method: 'POST'
        });

        const result = await response.json();
        if (result.success) {
            videoState.lastAttestation = result.attestation;
            displayVideoResult(result.attestation);
        } else {
            throw new Error('Failed to finalize attestation');
        }
    } catch (error) {
        console.error('Stop recording error:', error);
        showToast('Failed to process video: ' + error.message, 'error');
        document.getElementById('videoStatus').textContent = 'Error';
    }
}

function closeVideoRecording() {
    if (videoState.stream) {
        videoState.stream.getTracks().forEach(track => track.stop());
        videoState.stream = null;
    }

    if (videoState.frameInterval) {
        clearInterval(videoState.frameInterval);
    }

    videoState.isRecording = false;
    videoState.sessionId = null;
    videoState.frameCount = 0;

    hideElement('videoRecordingSection');
    showElement('videoModeSelect');
}

async function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
        showToast('Please select a video file', 'error');
        return;
    }

    event.target.value = '';

    // Show processing UI
    hideElement('videoModeSelect');
    showElement('videoProcessingSection');

    try {
        updateVideoProgress(10, 'Loading video...');

        // Extract keyframes from video
        const frames = await extractKeyframes(file);
        updateVideoProgress(50, `Extracted ${frames.length} keyframes...`);

        // Send to backend for attestation
        updateVideoProgress(70, 'Generating ZK attestation...');

        const response = await fetch('/api/zkvideo/attest/keyframes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                frames,
                metadata: {
                    filename: file.name,
                    size: file.size,
                    type: file.type
                }
            })
        });

        const result = await response.json();
        updateVideoProgress(100, 'Complete!');

        if (result.success) {
            videoState.lastAttestation = result.attestation;
            setTimeout(() => {
                hideElement('videoProcessingSection');
                displayVideoResult(result.attestation);
            }, 500);
        } else {
            throw new Error(result.message || 'Attestation failed');
        }

    } catch (error) {
        console.error('Video upload error:', error);
        showToast('Failed to process video: ' + error.message, 'error');
        hideElement('videoProcessingSection');
        showElement('videoModeSelect');
    }
}

async function extractKeyframes(videoFile) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = async () => {
            const duration = video.duration;
            const frameInterval = 1; // Extract 1 frame per second
            const frames = [];

            const canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.min(video.videoHeight, 480);
            const ctx = canvas.getContext('2d');

            for (let time = 0; time < duration; time += frameInterval) {
                try {
                    await seekToTime(video, time);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    frames.push({
                        data: canvas.toDataURL('image/jpeg', 0.7),
                        timestamp: time * 1000
                    });

                    updateVideoProgress(
                        10 + (time / duration) * 40,
                        `Extracting frame ${frames.length}...`
                    );
                } catch (e) {
                    console.warn('Frame extraction error at', time, e);
                }
            }

            URL.revokeObjectURL(video.src);
            resolve(frames);
        };

        video.onerror = () => {
            reject(new Error('Failed to load video'));
        };

        video.src = URL.createObjectURL(videoFile);
    });
}

function seekToTime(video, time) {
    return new Promise((resolve) => {
        video.currentTime = time;
        video.onseeked = () => resolve();
    });
}

function updateVideoProgress(percent, text) {
    document.getElementById('videoProgressBar').style.width = percent + '%';
    document.getElementById('videoProcessingText').textContent = text;
}

function displayVideoResult(attestation) {
    showElement('videoResultSection');
    hideElement('videoRecordingSection');

    document.getElementById('videoAttestationId').textContent = attestation.id;
    document.getElementById('videoMode').textContent = attestation.mode.replace('_', ' ').toUpperCase();
    document.getElementById('videoFrameCount').textContent = attestation.frameCount + ' frames';
    document.getElementById('videoResultDuration').textContent = formatDuration(attestation.duration);
    document.getElementById('videoStartHash').textContent = (attestation.startHash || 'N/A').substring(0, 24) + '...';
    document.getElementById('videoEndHash').textContent = (attestation.endHash || 'N/A').substring(0, 24) + '...';
    document.getElementById('videoChainIntegrity').textContent = attestation.chainIntegrity ? 'Valid' : 'Invalid';

    showToast('Video attested successfully!', 'success');
    createConfetti();
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function downloadVideoProof() {
    if (!videoState.lastAttestation) {
        showToast('No attestation to download', 'error');
        return;
    }

    const proof = JSON.stringify(videoState.lastAttestation, null, 2);
    const blob = new Blob([proof], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `video-attestation-${videoState.lastAttestation.id}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('Proof downloaded', 'success');
}

function resetVideoUI() {
    closeVideoRecording();
    hideElement('videoResultSection');
    hideElement('videoProcessingSection');
    showElement('videoModeSelect');
    videoState.lastAttestation = null;
}

// Initialize video listeners when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVideoListeners);
} else {
    setupVideoListeners();
}





