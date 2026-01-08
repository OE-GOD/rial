/**
 * TrueShot Web Crypto Module
 * Browser-based cryptographic signing for photo verification
 * Uses Web Crypto API with ECDSA P-256 (same as iOS Secure Enclave)
 */

const TrueeShotCrypto = {
    // Key storage name
    KEY_STORAGE: 'trueshot_keys',

    // Cached key pair
    _keyPair: null,
    _publicKeyBase64: null,

    /**
     * Initialize crypto module - load or generate keys
     */
    async init() {
        console.log('🔐 Initializing TrueShot Crypto...');

        // Try to load existing keys
        const stored = await this.loadKeys();
        if (stored) {
            this._keyPair = stored;
            this._publicKeyBase64 = await this.exportPublicKey(stored.publicKey);
            console.log('🔑 Loaded existing key pair');
            return true;
        }

        // Generate new key pair
        await this.generateKeyPair();
        console.log('🔑 Generated new key pair');
        return true;
    },

    /**
     * Generate ECDSA P-256 key pair (same curve as iOS Secure Enclave)
     */
    async generateKeyPair() {
        try {
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'ECDSA',
                    namedCurve: 'P-256'
                },
                true, // extractable (for storage)
                ['sign', 'verify']
            );

            this._keyPair = keyPair;
            this._publicKeyBase64 = await this.exportPublicKey(keyPair.publicKey);

            // Store keys
            await this.saveKeys(keyPair);

            return keyPair;
        } catch (error) {
            console.error('Key generation failed:', error);
            throw error;
        }
    },

    /**
     * Export public key as base64 (SPKI format - same as iOS)
     */
    async exportPublicKey(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        return this.arrayBufferToBase64(exported);
    },

    /**
     * Save keys to IndexedDB
     */
    async saveKeys(keyPair) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TrueShotDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys', { keyPath: 'id' });
                }
            };

            request.onsuccess = async (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['keys'], 'readwrite');
                const store = transaction.objectStore('keys');

                // Export keys for storage
                const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
                const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

                store.put({
                    id: 'primary',
                    privateKey: privateKeyJwk,
                    publicKey: publicKeyJwk,
                    createdAt: new Date().toISOString()
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Load keys from IndexedDB
     */
    async loadKeys() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TrueShotDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys', { keyPath: 'id' });
                }
            };

            request.onsuccess = async (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('keys')) {
                    resolve(null);
                    return;
                }

                const transaction = db.transaction(['keys'], 'readonly');
                const store = transaction.objectStore('keys');
                const getRequest = store.get('primary');

                getRequest.onsuccess = async () => {
                    const stored = getRequest.result;
                    if (!stored) {
                        resolve(null);
                        return;
                    }

                    try {
                        // Import keys from JWK
                        const privateKey = await crypto.subtle.importKey(
                            'jwk',
                            stored.privateKey,
                            { name: 'ECDSA', namedCurve: 'P-256' },
                            true,
                            ['sign']
                        );

                        const publicKey = await crypto.subtle.importKey(
                            'jwk',
                            stored.publicKey,
                            { name: 'ECDSA', namedCurve: 'P-256' },
                            true,
                            ['verify']
                        );

                        resolve({ privateKey, publicKey });
                    } catch (e) {
                        console.error('Failed to import keys:', e);
                        resolve(null);
                    }
                };

                getRequest.onerror = () => resolve(null);
            };

            request.onerror = () => resolve(null);
        });
    },

    /**
     * Sign data with private key (returns DER-encoded signature like iOS)
     */
    async sign(data) {
        if (!this._keyPair) {
            throw new Error('Crypto not initialized');
        }

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            this._keyPair.privateKey,
            data
        );

        // Convert to DER format (same as iOS Secure Enclave output)
        return this.rawToDer(new Uint8Array(signature));
    },

    /**
     * Convert raw signature to DER format
     */
    rawToDer(raw) {
        const r = raw.slice(0, 32);
        const s = raw.slice(32, 64);

        // Add padding if needed (DER requires leading 0x00 for negative numbers)
        const rPadded = r[0] >= 0x80 ? new Uint8Array([0x00, ...r]) : r;
        const sPadded = s[0] >= 0x80 ? new Uint8Array([0x00, ...s]) : s;

        const der = new Uint8Array([
            0x30, // SEQUENCE
            rPadded.length + sPadded.length + 4,
            0x02, // INTEGER
            rPadded.length,
            ...rPadded,
            0x02, // INTEGER
            sPadded.length,
            ...sPadded
        ]);

        return der;
    },

    /**
     * Compute Merkle root from image (1024 tiles like iOS)
     */
    async computeMerkleRoot(imageBuffer) {
        const data = new Uint8Array(imageBuffer);
        const tileCount = 1024;
        const tileSize = Math.ceil(data.length / tileCount);

        // Compute leaf hashes
        const leafHashes = [];
        for (let i = 0; i < tileCount; i++) {
            const start = i * tileSize;
            const end = Math.min(start + tileSize, data.length);
            const tileData = data.slice(start, end);

            if (tileData.length > 0) {
                const hash = await crypto.subtle.digest('SHA-256', tileData);
                leafHashes.push(new Uint8Array(hash));
            } else {
                // Empty tile - use zero hash
                leafHashes.push(new Uint8Array(32));
            }
        }

        // Build Merkle tree
        let level = leafHashes;
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

        return this.arrayBufferToHex(level[0].buffer);
    },

    /**
     * Create complete signed claim for image
     */
    async createSignedClaim(imageBuffer, metadata) {
        // Compute Merkle root
        const merkleRoot = await this.computeMerkleRoot(imageBuffer);
        console.log('🌳 Merkle root:', merkleRoot.substring(0, 32) + '...');

        // Convert Merkle root to bytes and hash it (what we sign)
        const merkleRootBytes = this.hexToArrayBuffer(merkleRoot);
        const messageHash = await crypto.subtle.digest('SHA-256', merkleRootBytes);

        // Sign the hash
        const signature = await this.sign(messageHash);
        const signatureBase64 = this.arrayBufferToBase64(signature.buffer);
        console.log('✍️ Signature created');

        // Create C2PA-style claim
        const claim = {
            imageRoot: merkleRoot,
            signature: signatureBase64,
            publicKey: this._publicKeyBase64,
            timestamp: new Date().toISOString(),
            algorithm: 'ES256', // ECDSA with P-256 and SHA-256
            tileCount: 1024,
            claimGenerator: 'TrueShot Web v1.0',
            deviceBinding: await this.getDeviceFingerprint()
        };

        return claim;
    },

    /**
     * Get device fingerprint for binding
     */
    async getDeviceFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unknown'
        ];

        const data = new TextEncoder().encode(components.join('|'));
        const hash = await crypto.subtle.digest('SHA-256', data);
        return this.arrayBufferToHex(hash).substring(0, 16);
    },

    /**
     * Capture comprehensive device metadata
     */
    async captureMetadata() {
        const metadata = {
            // Device info
            deviceType: this.getDeviceType(),
            browser: this.getBrowser(),
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${screen.width}x${screen.height}`,
            pixelRatio: window.devicePixelRatio,
            colorDepth: screen.colorDepth,

            // Timing
            captureTimestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

            // Camera info (if available)
            cameraModel: 'Web Camera',

            // Will be filled by GPS/motion capture
            latitude: null,
            longitude: null,
            locationAccuracy: null,
            accelerometerX: null,
            accelerometerY: null,
            accelerometerZ: null,
            gyroX: null,
            gyroY: null,
            gyroZ: null
        };

        // Try to get GPS
        try {
            const position = await this.getGPSPosition();
            metadata.latitude = position.coords.latitude;
            metadata.longitude = position.coords.longitude;
            metadata.locationAccuracy = position.coords.accuracy;
            metadata.altitude = position.coords.altitude;
            console.log('📍 GPS captured');
        } catch (e) {
            console.log('📍 GPS not available');
        }

        // Try to get motion data
        try {
            const motion = await this.captureMotionData();
            if (motion) {
                metadata.accelerometerX = motion.acceleration?.x || motion.accelerationIncludingGravity?.x;
                metadata.accelerometerY = motion.acceleration?.y || motion.accelerationIncludingGravity?.y;
                metadata.accelerometerZ = motion.acceleration?.z || motion.accelerationIncludingGravity?.z;
                metadata.gyroX = motion.rotationRate?.alpha;
                metadata.gyroY = motion.rotationRate?.beta;
                metadata.gyroZ = motion.rotationRate?.gamma;
                console.log('📱 Motion data captured');
            }
        } catch (e) {
            console.log('📱 Motion data not available');
        }

        return metadata;
    },

    /**
     * Get GPS position with timeout
     */
    getGPSPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    },

    /**
     * Capture motion sensor data
     */
    captureMotionData() {
        return new Promise((resolve) => {
            if (!window.DeviceMotionEvent) {
                resolve(null);
                return;
            }

            // Request permission on iOS 13+
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission()
                    .then(permission => {
                        if (permission === 'granted') {
                            this._captureMotionOnce(resolve);
                        } else {
                            resolve(null);
                        }
                    })
                    .catch(() => resolve(null));
            } else {
                this._captureMotionOnce(resolve);
            }
        });
    },

    _captureMotionOnce(resolve) {
        const handler = (event) => {
            window.removeEventListener('devicemotion', handler);
            resolve(event);
        };

        window.addEventListener('devicemotion', handler);

        // Timeout after 2 seconds
        setTimeout(() => {
            window.removeEventListener('devicemotion', handler);
            resolve(null);
        }, 2000);
    },

    // =====================================
    // Utility Functions
    // =====================================

    getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile';
        return 'desktop';
    },

    getBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Unknown';
    },

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    arrayBufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    hexToArrayBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    },

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};

// Export for use
window.TrueShotCrypto = TrueeShotCrypto;
console.log('🔐 TrueShot Crypto module loaded');
