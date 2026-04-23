# CSCI435 Web Wallet

A browser-extension HD wallet prototype for CSCI 435 that supports onboarding, account management, and Sepolia transaction signing.

## Features

- Create wallet with generated BIP39 mnemonic.
- Import wallet by seed phrase or private key.
- Derive multiple HD accounts (`m/44'/60'/0'/0/{index}`).
- Import additional external private-key accounts.
- Lock/unlock wallet with encrypted local storage.
- Get balance and send transactions on Sepolia.
- Inject `window.ethereum` provider for dApp RPC calls.

## Project Structure

- `src/popup/` extension UI for onboarding, unlock, dashboard, and send flow.
- `src/background/` RPC request handling and signer actions.
- `src/content/` bridge from web page to extension runtime.
- `src/injected/` in-page provider exposed as `window.ethereum`.
- `src/utils/` wallet derivation/transaction logic and encrypted storage helpers.

## Setup

### Prerequisites

- Bun installed (`bun --version`)
- Chrome/Chromium browser

### Install

```bash
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Lint

```bash
bun run lint
```

## Load Extension in Chrome

1. Build the project with `bun run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project `dist` directory.
5. Open the extension popup and complete onboarding.

## Current Limitations

- Network is currently fixed to Sepolia.
- Provider RPC support is intentionally limited (basic account/sign/send flow).
- No automated tests yet (planned in rubric improvement roadmap).
- No per-request confirmation UI yet for dApp-initiated sign/send.

## Rubric Evidence Docs

- `docs/rubric-evidence.md`
- `docs/contributions.md`
- `docs/milestone-1.md`
- `docs/milestone-2.md`