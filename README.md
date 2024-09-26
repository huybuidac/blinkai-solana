1. Install solana and anchor CLI
- You can see the doc for detail https://www.anchor-lang.com/docs/installation
2. Install dependencies
- yarn
1. Setup private key
- create `./.pks` directory
- create `./.pks/deployer-test.json` file and past private key into this
1. Build program
- anchor build
1. Resync program address
- anchor keys sync
1. Deploy program
- yarn deploy:test
1. Call create state function
- yarn createState:test
1. Create POOL
- open scripts/create-pool.ts then edit the config inside
- yarn createPool:test