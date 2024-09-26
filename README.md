# Project Name

Simple Token Vault

## System Requirements

- Node.js
- Yarn
- Solana CLI
- Anchor CLI

## Installation

1. Install Solana and Anchor CLI
   - For detailed instructions, see: https://www.anchor-lang.com/docs/installation

2. Install dependencies
   ```
   yarn install
   ```

3. Set up private key
   - Create `./.pks` directory
   - Create `./.pks/deployer-test.json` file and paste your private key into it

## Build and Deploy

1. Build the program
   ```
   anchor build
   ```

2. Sync program address
   ```
   anchor keys sync
   ```

3. Test the program
   ```
   anchor test
   ```

4. Deploy the program
   ```
   yarn deploy:test
   ```

## Usage

1. Create state
   ```
   yarn createState:test
   ```

2. Create POOL
   - Open `scripts/create-pool.ts` and edit the configuration inside
   - Run the command:
     ```
     yarn createPool:test
     ```

3. Create Mint (if needed)
   - See `scripts/create-mint.ts` for details on token creation and minting

## Account Structures

- StateAccount: manages some global state (if any)
- PoolAccount: 
  - each pool has a unique slug (max 32 characters)
  - stores information about authority, mint, fee, user max amount
- UserPoolAccount:
  - stores user information for each pool