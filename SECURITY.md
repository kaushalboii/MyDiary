# Security Policy 🛡️

## Overview

MyDiary is architected with a **Zero-Knowledge, Privacy-First Security Model**. All sensitive diary memories, personal notes, and journal entries are encrypted client-side in the user's browser before ever being transmitted to a storage server.

---

## 🔒 Security Architecture & Anti-Tamper Guarantees

### 1. Client-Side End-to-End Encryption (E2EE)
- **Encryption Standard:** `AES-256-GCM` (Galois/Counter Mode with 128-bit authentication tag).
- **Key Derivation:** `PBKDF2-SHA256` using **310,000 iterations** (exceeding OWASP recommendations) and a cryptographically secure 16-byte salt per user.
- **Zero-Knowledge Server:** The backend storage server only receives and stores AES-256 ciphertext and initialization vectors (`iv`). Even if a bad actor gains unauthorized access to the storage server or its raw database files, **they cannot read your memories without your private passphrase**.

### 2. Multi-User Authentication & Isolation
- **Password Hashing:** Passwords are never stored in plaintext. They are hashed using Node.js `scrypt` with a random 16-byte salt and memory-hard parameters ($N=16384, r=8, p=1$).
- **Session Tokens:** Stateless `v1.` session tokens signed using `HMAC-SHA256` with expiration checks and user scope verification.
- **Strict Data Scoping:** Each member's volumes and entries are isolated to their specific user account (`scopeId`). No user can access, query, modify, or delete another user's volumes.

### 3. Credential Protection
- **No Hardcoded Secrets:** Static builds (`out/` directory deployed to GitHub Pages) contain zero API keys, tokens, or private secrets.
- **Scrubbed Local Storage:** Plaintext session tokens and encryption keys are scrubbed and kept strictly in ephemeral session memory.
- **Path Traversal Protection:** All file uploads and book IDs are strictly validated to prevent directory traversal attacks (`../`).

### 4. Brute-Force & Abuse Mitigation
- Authentication endpoints (`/api/auth/login`, `/api/auth/register`) implement in-memory rate limiting with progressive backoff.
- Remote setup tokens are 64-character cryptographically random hex strings with file permissions restricted to `chmod 600`.

---

## 📋 Supported Versions

| Version | Supported |
| :--- | :--- |
| v43+ (Current) | :white_check_mark: |
| < v43 | :x: Please update to the latest release |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability within MyDiary, please report it privately:

1. **GitHub Security Advisory:** Submit a private advisory at [https://github.com/kaushalboii/MyDiary/security/advisories/new](https://github.com/kaushalboii/MyDiary/security/advisories/new).
2. **Direct Contact:** Open an issue marked with the `security` label or reach out to [@kaushalboii](https://github.com/kaushalboii).

Please do not disclose security issues publicly until a patch has been published. All valid vulnerability reports will be addressed promptly.
