/**
 * WebAuthn Crypto Module for TrueShot
 *
 * Uses device hardware security (Secure Enclave, TPM, TEE) for signing
 *
 * Benefits:
 * - Private key NEVER leaves hardware
 * - Requires biometric (Face ID, fingerprint) or PIN
 * - Phishing resistant
 * - Non-extractable keys
 */

const WebAuthnCrypto = {
    // Credential storage
    _credential: null,
    _credentialId: null,
    _publicKey: null,

    // Server challenge (in production, get from server)
    _challenge: null,

    // RP (Relying Party) info
    RP_ID: window.location.hostname,
    RP_NAME: 'TrueShot',

    /**
     * Initialize WebAuthn - check support and load existing credential
     */
    async init() {
        console.log('🔐 Initializing WebAuthn Crypto...');

        // Check WebAuthn support
        if (!window.PublicKeyCredential) {
            console.log('❌ WebAuthn not supported');
            return { supported: false, reason: 'WebAuthn not supported in this browser' };
        }

        // Check if platform authenticator available (Face ID, fingerprint, etc.)
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) {
            console.log('⚠️ Platform authenticator not available');
            return { supported: false, reason: 'No biometric/PIN available on this device' };
        }

        // Try to load existing credential
        const stored = localStorage.getItem('trueshot_webauthn_credential');
        if (stored) {
            const data = JSON.parse(stored);
            this._credentialId = this.base64ToArrayBuffer(data.credentialId);
            this._publicKey = data.publicKey;
            console.log('🔑 Loaded existing WebAuthn credential');
            return { supported: true, registered: true };
        }

        console.log('🔑 WebAuthn ready - needs registration');
        return { supported: true, registered: false };
    },

    /**
     * Register a new passkey (creates hardware-backed key pair)
     * This prompts for biometric/PIN
     */
    async register(username = 'TrueShot User') {
        console.log('📝 Registering new WebAuthn credential...');

        // Generate challenge (in production, get from server)
        this._challenge = crypto.getRandomValues(new Uint8Array(32));

        // User ID (unique per user)
        const userId = crypto.getRandomValues(new Uint8Array(16));

        const publicKeyCredentialCreationOptions = {
            challenge: this._challenge,

            rp: {
                name: this.RP_NAME,
                id: this.RP_ID
            },

            user: {
                id: userId,
                name: username,
                displayName: username
            },

            // Request ECDSA P-256 key (same as iOS Secure Enclave)
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' },  // ES256 (ECDSA P-256)
                { alg: -257, type: 'public-key' } // RS256 (fallback)
            ],

            authenticatorSelection: {
                // Prefer platform authenticator (built-in Face ID, fingerprint)
                authenticatorAttachment: 'platform',
                // Require user verification (biometric/PIN)
                userVerification: 'required',
                // Create discoverable credential (passkey)
                residentKey: 'preferred'
            },

            timeout: 60000,

            attestation: 'direct'
        };

        try {
            // This triggers biometric prompt!
            const credential = await navigator.credentials.create({
                publicKey: publicKeyCredentialCreationOptions
            });

            console.log('✅ WebAuthn credential created');

            // Extract public key
            const publicKeyBytes = credential.response.getPublicKey();
            const publicKeyBase64 = this.arrayBufferToBase64(publicKeyBytes);

            // Store credential ID for later use
            this._credentialId = credential.rawId;
            this._publicKey = publicKeyBase64;
            this._credential = credential;

            // Save to localStorage (only credential ID, not the key itself!)
            localStorage.setItem('trueshot_webauthn_credential', JSON.stringify({
                credentialId: this.arrayBufferToBase64(credential.rawId),
                publicKey: publicKeyBase64,
                createdAt: new Date().toISOString(),
                algorithm: credential.response.getPublicKeyAlgorithm()
            }));

            return {
                success: true,
                credentialId: this.arrayBufferToBase64(credential.rawId),
                publicKey: publicKeyBase64
            };

        } catch (error) {
            console.error('❌ WebAuthn registration failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Sign data using WebAuthn (requires biometric)
     * This is used to sign photo attestations
     */
    async sign(data) {
        if (!this._credentialId) {
            throw new Error('No WebAuthn credential registered');
        }

        console.log('✍️ Signing with WebAuthn (biometric required)...');

        // Convert data to ArrayBuffer if needed
        let dataBuffer;
        if (data instanceof ArrayBuffer) {
            dataBuffer = data;
        } else if (typeof data === 'string') {
            dataBuffer = new TextEncoder().encode(data);
        } else {
            dataBuffer = new Uint8Array(data).buffer;
        }

        // Hash the data first (WebAuthn signs the hash)
        const dataHash = await crypto.subtle.digest('SHA-256', dataBuffer);

        const publicKeyCredentialRequestOptions = {
            challenge: new Uint8Array(dataHash),
            allowCredentials: [{
                id: this._credentialId,
                type: 'public-key',
                transports: ['internal'] // Platform authenticator
            }],
            userVerification: 'required', // Force biometric/PIN
            timeout: 60000
        };

        try {
            // This triggers biometric prompt!
            const assertion = await navigator.credentials.get({
                publicKey: publicKeyCredentialRequestOptions
            });

            console.log('✅ Signature created with biometric verification');

            return {
                signature: this.arrayBufferToBase64(assertion.response.signature),
                authenticatorData: this.arrayBufferToBase64(assertion.response.authenticatorData),
                clientDataJSON: this.arrayBufferToBase64(assertion.response.clientDataJSON),
                credentialId: this.arrayBufferToBase64(assertion.rawId)
            };

        } catch (error) {
            console.error('❌ WebAuthn signing failed:', error);
            throw error;
        }
    },

    /**
     * Create signed claim for photo using WebAuthn
     */
    async createSignedClaim(imageBuffer, metadata) {
        // Compute Merkle root
        const merkleRoot = await this.computeMerkleRoot(imageBuffer);
        console.log('🌳 Merkle root:', merkleRoot.substring(0, 32) + '...');

        // Sign with WebAuthn (triggers biometric!)
        const signResult = await this.sign(this.hexToArrayBuffer(merkleRoot));

        const claim = {
            imageRoot: merkleRoot,
            signature: signResult.signature,
            publicKey: this._publicKey,
            authenticatorData: signResult.authenticatorData,
            timestamp: new Date().toISOString(),
            algorithm: 'ES256-WebAuthn',
            signatureType: 'webauthn',
            tileCount: 1024,
            claimGenerator: 'TrueShot WebAuthn v1.0',
            biometricVerified: true
        };

        return claim;
    },

    /**
     * Check if WebAuthn signing is available
     */
    async isAvailable() {
        if (!window.PublicKeyCredential) return false;

        try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            return available;
        } catch {
            return false;
        }
    },

    /**
     * Get public key (for verification)
     */
    getPublicKey() {
        return this._publicKey;
    },

    /**
     * Check if registered
     */
    isRegistered() {
        return !!this._credentialId;
    },

    // =====================================
    // Merkle Tree (same as regular crypto)
    // =====================================

    async computeMerkleRoot(imageBuffer) {
        const data = new Uint8Array(imageBuffer);
        const tileCount = 1024;
        const tileSize = Math.ceil(data.length / tileCount);

        const leafHashes = [];
        for (let i = 0; i < tileCount; i++) {
            const start = i * tileSize;
            const end = Math.min(start + tileSize, data.length);
            const tileData = data.slice(start, end);

            if (tileData.length > 0) {
                const hash = await crypto.subtle.digest('SHA-256', tileData);
                leafHashes.push(new Uint8Array(hash));
            } else {
                leafHashes.push(new Uint8Array(32));
            }
        }

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

    // =====================================
    // Utilities
    // =====================================

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
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
    }
};

// Export
window.WebAuthnCrypto = WebAuthnCrypto;
console.log('🔐 WebAuthn Crypto module loaded');
