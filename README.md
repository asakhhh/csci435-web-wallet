# csci435-web-wallet
Minimalist Hierarchical Deterministic Web Wallet for:
- storing and managing keys
- signing transactions

## What is hierarchical deterministic web wallet?
A hierarchical deterministic wallet is a special kind of wallet that uses a random number to create virtually infinite cryptocurrency key pairs.

Public blockchains basically allow anyone to view all the transactions and balances you’ve made on the blockchain. A hierarchical deterministic (HD) wallet ensures that no one can know your exact balance by creating multiple addresses.

### What does deterministic mean?
Before HD wallets, non-deterministic wallets ruled the cryptocurrency world. They used to produce unrelated key pairs for every crypto account. For instance, the public key and the private key were unrelated despite being for the same wallet or account. What’s worse, the derived key pairs can’t be retraced to an original random phrase. This forced users to back up every key pair separately. For one or two wallets, backing up four keys is reasonable (but not convenient), but imagine when you’re managing 100 accounts? That makes for 200 unrelated keys for you to track, which is quite impractical. A hierarchical deterministic wallet solves this challenge.

A hierarchical deterministic (HD) wallet describes a wallet that generates all its keys from a single recovery phrase in a tree-like pattern. This recovery phrase can be used to recreate the entire wallet, even if the wallet is lost or damaged. HD wallets have become popular for their convenience.
