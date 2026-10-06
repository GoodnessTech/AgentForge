# AgentForge — AI Agent Operational Economy Launchpad

**AgentForge** is an on-chain launchpad and economic infrastructure layer for autonomous AI agents deployed on **BOT Chain Mainnet**.

Unlike speculative memecoin launchpads, AgentForge launches the complete **operational economy** around an AI agent:
$$\text{IDENTITY} + \text{TREASURY} + \text{PERMISSIONS} + \text{SERVICE} + \text{ECONOMIC MODEL} + \text{FUNDING} + \text{EXECUTION POLICY}$$

---

## 🌐 BOT Chain Mainnet Deployment

- **Network Name:** BOT Chain Mainnet
- **Chain ID:** `677` (`0x2a5`)
- **RPC URL:** `https://rpc.botchain.ai`
- **Block Explorer:** `https://scan.botchain.ai`
- **Native Currency:** `BOT` (18 decimals)

### Verified Smart Contracts

| Contract | Address | Transaction Hash | Gas Used |
| :--- | :--- | :--- | :--- |
| **AgentVault Implementation** | [`0xfcfa014985b4a8536be59007426c66292e390d1a`](https://scan.botchain.ai/address/0xfcfa014985b4a8536be59007426c66292e390d1a) | `0x8fd807e7850b5792adb457731ffc450dc2335c2e7d19d9e3c24e12732dba322e` | 866,204 |
| **AgentForgeFactory** | [`0xe885c275272d3433d1413cae803c2e8c8481ea8b`](https://scan.botchain.ai/address/0xe885c275272d3433d1413cae803c2e8c8481ea8b) | `0x76cc2e2bf42a5eb6f84359f091f0bb901cd153de531ee449269612514e3fb16f` | 913,775 |

### Genesis Agent Economy: Nexus Sentinel (ID: #1)

- **Agent Name:** Nexus Sentinel
- **Vault Clone Address:** [`0x5e95F7169749d73Dfc4fab17AB2b60146d05eA3d`](https://scan.botchain.ai/address/0x5e95F7169749d73Dfc4fab17AB2b60146d05eA3d)
- **Creation Tx:** `0x6e593c10ba3fa3bd08ea2055f2d8b24f7c9efb501d5ca37f574e591e069689c7`
- **Initial Funding Tx:** `0x513653796539493937451e57ef38889eab9130f92857e413e653f6853e98e29a` (`0.005 BOT`)

---

## 🏛 Architecture & Security Model

```
                    +------------------------------------+
                    |        AgentForgeFactory           |
                    | 0xe885c275272d3433d1413cae803c... |
                    +-----------------+------------------+
                                      | clones (ERC-1167)
                                      v
+--------------------------------------------------------------------------+
|                        AgentVault (Clone Instance)                       |
| 0x5e95F7169749d73Dfc4fab17AB2b60146d05eA3d                               |
+--------------------------------------------------------------------------+
|  1. FUNDING: Users contribute native BOT until target / deadline         |
|  2. REVENUE: Customers pay for agent service via payRevenue()            |
|  3. EXECUTION POLICY: Guardrails for agent executionAddress:            |
|     - maxPerTx limit                                                     |
|     - dailyLimit rolling 24-hour spend window                            |
|     - policyExpiry timestamp                                             |
|     - allowedTarget whitelist                                            |
|  4. DISTRIBUTIONS: Creator executes controlled profit-sharing             |
|  5. EMERGENCY: Creator can pause/unpause vault in contingency scenarios  |
+--------------------------------------------------------------------------+
```

### Protocol Design Decisions
1. **ERC-1167 Minimal Proxy Clones**: Deploys lightweight ~45-byte proxy pointers to the immutable `AgentVault` logic contract, reducing agent launch costs by ~90% compared to full contract deployments.
2. **EVM Compatibility**: Compiled with Solc 0.8.24 using `viaIR: true`, `optimizer.runs: 200`, and `evmVersion: 'paris'` to prevent Cancun opcode incompatibilities on EVM sidechains.
3. **Defense in Depth**: OpenZeppelin `ReentrancyGuardUpgradeable`, strict checks-effects-interactions, rolling 24-hour daily spend ceilings, per-transaction spend caps, and explicit target whitelists.
4. **Single-RPC Summary Views**: `getAllAgentSummaries()` aggregates all agent identities, real-time treasury balances, total revenue, and pause states in a single JSON-RPC call.

---

## 🧪 Comprehensive Protocol Test Suite

The test suite validates 100% of the operational and economic lifecycle:

```bash
node test/agentforge.test.mjs
```

### Test Coverage (17 / 17 Passing):
- **Deployment & Gas Costs**: Implementation and factory gas benchmarking.
- **Agent Creation**: Factory cloning, event emission, identity indexing.
- **Input Validation**: Empty name revert protection.
- **Treasury & Funding**: Native BOT contribution, per-backer balance tracking, deadline enforcement.
- **Policy Rails**: Execution within bounds, `maxPerTx` reverts, `dailyLimit` 24h rolling reset reverts.
- **Security Access Control**: Unauthorized caller rejection, unapproved target filtering.
- **Revenue Operations**: Service payment ingestion and accounting.
- **Distributions**: Profit-sharing payouts to contributors and creators.
- **Transfer Safety**: Safe handling of non-payable recipient call failures.
- **Emergency Circuit Breaker**: Pause/unpause toggles disabling executions while protecting state.
- **Policy Management**: Creator policy updating and execution address rotation.
- **Data Aggregators**: Multi-agent summary querying for low-latency frontend sync.

---

## 💻 Running the Frontend

The frontend is built with React, Vite, Tailwind CSS, Lucide icons, and a custom `BotChainGateway` connecting directly to BOT Chain Mainnet:

```bash
cd "AgentForge Frontend"
pnpm install
pnpm run dev      # Local development server
pnpm run build    # Production build to dist/
pnpm run preview  # Serve production build on http://localhost:5173
```

### Wallet Setup
To interact directly with the contracts via MetaMask or Rabby:
1. **Network Name:** BOT Chain Mainnet
2. **RPC URL:** `https://rpc.botchain.ai`
3. **Chain ID:** `677`
4. **Currency Symbol:** `BOT`
5. **Explorer:** `https://scan.botchain.ai`
