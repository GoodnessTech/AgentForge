import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Check, Compass, FileCode2, Fingerprint,
  Gauge, Landmark, Menu, Network, Plus, ReceiptText, ShieldCheck, Wallet, X, Zap,
  RefreshCw, AlertCircle, ExternalLink, Play, Pause, DollarSign, Send
} from 'lucide-react';
import {
  BOT_CHAIN, CONTRACT_CONFIG, emptyLaunchDraft, gateway,
  type AgentSummary, type LaunchDraft, type WalletState, type TransactionState
} from './lib/agentforge';

type View = 'home' | 'explore' | 'launch' | 'dashboard' | 'treasury';

const navItems: { id: View; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'launch', label: 'Launch', icon: Plus },
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'treasury', label: 'Treasury Flow', icon: Landmark },
];

const primitives = [
  ['01', 'IDENTITY', 'An agent identity verified, funded and held accountable on BOT Chain.'],
  ['02', 'TREASURY', 'Isolated ERC-1167 smart contract vault for capital in, operations and revenue.'],
  ['03', 'PERMISSIONS', 'Cryptographic constraints defining what an agent can touch on-chain.'],
  ['04', 'SERVICE', 'Legible on-chain service definition giving the economy a real purpose.'],
  ['05', 'ECONOMICS', 'Native BOT funding, service revenues and pro-rata distributions.'],
  ['06', 'EXECUTION', 'Policy-enforced rails preventing out-of-bounds agent transactions.'],
];

const launchSteps = ['Identity', 'Service', 'Treasury', 'Permissions', 'Economics', 'Policy', 'Review'];

function App() {
  const [view, setView] = useState<View>('home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState>({ status: 'disconnected' });
  const [walletMenu, setWalletMenu] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);
  const [draft, setDraft] = useState<LaunchDraft>(emptyLaunchDraft);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [fundModalAgent, setFundModalAgent] = useState<AgentSummary | null>(null);
  const [revenueModalAgent, setRevenueModalAgent] = useState<AgentSummary | null>(null);
  const [txState, setTxState] = useState<TransactionState>({ status: 'idle' });

  // Fetch real on-chain agents
  const refreshAgents = async () => {
    setLoadingAgents(true);
    try {
      const list = await gateway.getAgents();
      setAgents(list);
      if (list.length > 0 && !selectedAgent) {
        setSelectedAgent(list[0]);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    refreshAgents();
  }, []);

  // Listen to wallet accounts and chain changes
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        setWallet({ status: 'disconnected' });
      } else {
        const balance = await gateway.getWalletBalance(accounts[0]);
        setWallet(w => ({ ...w, status: 'connected', address: accounts[0], balance }));
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      if (chainId !== BOT_CHAIN.chainId) {
        setWallet(w => ({ ...w, status: 'wrong-network', chainId }));
      } else {
        setWallet(w => ({ ...w, chainId: BOT_CHAIN.chainId }));
      }
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener('accountsChanged', handleAccountsChanged);
      eth.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const go = (next: View) => {
    setView(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConnectWallet = async () => {
    setWallet({ status: 'connecting' });
    const res = await gateway.connectWallet();
    setWallet(res);
  };

  const handleLaunchAgent = async () => {
    setTxState({ status: 'preparing' });
    const res = await gateway.launchAgent(draft);
    setTxState(res);
    if (res.status === 'success') {
      await refreshAgents();
    }
  };

  const handleFundAgent = async (vaultAddress: string, amount: string) => {
    setTxState({ status: 'preparing' });
    const res = await gateway.fundAgent(vaultAddress, amount);
    setTxState(res);
    if (res.status === 'success') {
      await refreshAgents();
      setFundModalAgent(null);
    }
    return res;
  };

  const handlePayRevenue = async (vaultAddress: string, amount: string) => {
    setTxState({ status: 'preparing' });
    const res = await gateway.payRevenue(vaultAddress, amount);
    setTxState(res);
    if (res.status === 'success') {
      await refreshAgents();
      setRevenueModalAgent(null);
    }
    return res;
  };

  const handleTogglePause = async (vaultAddress: string, currentPaused: boolean) => {
    setTxState({ status: 'preparing' });
    const res = await gateway.togglePause(vaultAddress, currentPaused);
    setTxState(res);
    if (res.status === 'success') {
      await refreshAgents();
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')} aria-label="AgentForge home">
          <span className="brand-mark"><Bot size={19} strokeWidth={2.7} /></span>
          <span>AGENT<span>FORGE</span></span>
        </button>
        <nav className="desktop-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'nav-link active' : 'nav-link'} onClick={() => go(id)}>
              <Icon size={15} />{label}
            </button>
          ))}
          <a
            className="nav-link"
            href={`${BOT_CHAIN.explorerUrl}/address/${CONTRACT_CONFIG.factoryAddress}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileCode2 size={15} />Factory Contract <ExternalLink size={12} />
          </a>
        </nav>
        <div className="top-actions">
          <div className="network-pill" title={`Chain ID: ${BOT_CHAIN.chainId} (${BOT_CHAIN.name})`}>
            <span className="pulse" />
            {BOT_CHAIN.name}
          </div>
          <button
            className="wallet-button"
            onClick={() => wallet.status === 'connected' ? setWalletMenu(!walletMenu) : handleConnectWallet()}
          >
            <Wallet size={15} />
            {wallet.status === 'connecting'
              ? 'Connecting...'
              : wallet.status === 'connected'
              ? `${wallet.address?.slice(0, 6)}...${wallet.address?.slice(-4)}`
              : wallet.status === 'wrong-network'
              ? 'Switch to BOT Chain'
              : 'Connect wallet'}
          </button>
          <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">
            <Menu size={20} />
          </button>
        </div>

        {walletMenu && (
          <div className="wallet-popover">
            <div className="eyebrow">WALLET CONNECTED</div>
            <strong>{wallet.address}</strong>
            <div className="wallet-chain">
              <span className="pulse" />
              {BOT_CHAIN.name}
              <span className="chain-id">#{BOT_CHAIN.chainId}</span>
            </div>
            {wallet.balance && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#888' }}>
                Balance: <strong>{wallet.balance} BOT</strong>
              </div>
            )}
            <button
              className="text-button"
              style={{ marginTop: '0.6rem' }}
              onClick={() => { setWallet({ status: 'disconnected' }); setWalletMenu(false); }}
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      {mobileOpen && (
        <div className="mobile-menu">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => go(id)}>
              <Icon size={17} />{label}<ArrowRight size={15} />
            </button>
          ))}
          <a
            href={`${BOT_CHAIN.explorerUrl}/address/${CONTRACT_CONFIG.factoryAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
          >
            <FileCode2 size={17} />Factory Contract<ExternalLink size={15} />
          </a>
        </div>
      )}

      {view === 'home' && (
        <Home
          go={go}
          agentsCount={agents.length}
          onFund={(agent) => setFundModalAgent(agent)}
          agents={agents}
        />
      )}

      {view === 'explore' && (
        <Explore
          agents={agents}
          loading={loadingAgents}
          onRefresh={refreshAgents}
          onFund={(agent) => setFundModalAgent(agent)}
          onPayRevenue={(agent) => setRevenueModalAgent(agent)}
          onSelect={(agent) => { setSelectedAgent(agent); go('treasury'); }}
          onLaunch={() => go('launch')}
        />
      )}

      {view === 'launch' && (
        <LaunchWizard
          step={launchStep}
          setStep={setLaunchStep}
          draft={draft}
          setDraft={setDraft}
          txState={txState}
          onLaunch={handleLaunchAgent}
          onConnect={handleConnectWallet}
          wallet={wallet}
          onViewAgent={() => { refreshAgents(); go('explore'); }}
        />
      )}

      {view === 'dashboard' && (
        <Dashboard
          agents={agents}
          wallet={wallet}
          onConnect={handleConnectWallet}
          onLaunch={() => go('launch')}
          onTogglePause={handleTogglePause}
          onFund={(agent) => setFundModalAgent(agent)}
          onPayRevenue={(agent) => setRevenueModalAgent(agent)}
          onSelect={(agent) => { setSelectedAgent(agent); go('treasury'); }}
        />
      )}

      {view === 'treasury' && (
        <TreasuryView
          agents={agents}
          selected={selectedAgent || agents[0] || null}
          onSelectAgent={setSelectedAgent}
          onFund={(agent) => setFundModalAgent(agent)}
          onPayRevenue={(agent) => setRevenueModalAgent(agent)}
          onLaunch={() => go('launch')}
        />
      )}

      {fundModalAgent && (
        <FundingModal
          agent={fundModalAgent}
          onClose={() => setFundModalAgent(null)}
          wallet={wallet}
          onConnect={handleConnectWallet}
          onConfirm={(amount) => handleFundAgent(fundModalAgent.vault || '', amount)}
        />
      )}

      {revenueModalAgent && (
        <RevenueModal
          agent={revenueModalAgent}
          onClose={() => setRevenueModalAgent(null)}
          wallet={wallet}
          onConnect={handleConnectWallet}
          onConfirm={(amount) => handlePayRevenue(revenueModalAgent.vault || '', amount)}
        />
      )}

      <footer className="footer">
        <div className="brand footer-brand">
          <span className="brand-mark"><Bot size={16} /></span>
          <span>AGENT<span>FORGE</span></span>
        </div>
        <span>
          Mainnet Factory: <a href={`${BOT_CHAIN.explorerUrl}/address/${CONTRACT_CONFIG.factoryAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{CONTRACT_CONFIG.factoryAddress}</a>
        </span>
        <span className="footer-right">
          <a href="https://botchain.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>BOTCHAIN</a>
          {' · '}
          <a href="https://scan.botchain.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>BOTSCAN</a>
          {' · '}
          Chain ID {BOT_CHAIN.chainId}
        </span>
      </footer>
    </div>
  );
}

function Home({ go, agentsCount, agents, onFund }: { go: (view: View) => void; agentsCount: number; agents: AgentSummary[]; onFund: (agent: AgentSummary) => void }) {
  return (
    <main>
      <section className="hero section-pad">
        <div className="hero-copy">
          <div className="availability">
            <span className="availability-dot" />
            LIVE ON BOT CHAIN MAINNET ({agentsCount} ACTIVE) <ArrowUpRight size={13} />
          </div>
          <h1>Launch the economy behind your <em>AI agent.</em></h1>
          <p className="hero-lede">
            Identity, treasury, permissions, funding and execution policies in one verified on-chain launchpad.
          </p>
          <div className="hero-buttons">
            <button className="button button-dark" onClick={() => go('launch')}>
              Launch an Agent <ArrowUpRight size={15} />
            </button>
            <button className="button button-outline" onClick={() => go('explore')}>
              Explore Live Agents ({agentsCount}) <ArrowRight size={15} />
            </button>
          </div>
          <div className="hero-meta">
            <span>CHAIN ID {BOT_CHAIN.chainId}</span>
            <span className="meta-line" />
            <span>NATIVE BOT TREASURIES</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-plate">
            <div className="plate-grid" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="core">
              <Bot size={35} />
              <span>AGENT</span>
            </div>
            <div className="flow-node node-one">
              <Fingerprint size={15} />
              <span>IDENTITY</span>
            </div>
            <div className="flow-node node-two">
              <Landmark size={15} />
              <span>TREASURY</span>
            </div>
            <div className="flow-node node-three">
              <ShieldCheck size={15} />
              <span>POLICY</span>
            </div>
            <div className="visual-caption">
              <span>MAINNET READY</span>
              <strong>01 / 07</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Live Agents Preview */}
      {agents.length > 0 && (
        <section className="section-pad" style={{ background: 'var(--surface, #111)', borderTop: '1px solid #222', borderBottom: '1px solid #222' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <div className="section-kicker">ON-CHAIN REGISTRY <span>LIVE ACTORS</span></div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Active Agent Economies</h2>
            </div>
            <button className="text-arrow" onClick={() => go('explore')}>
              View all {agents.length} agents <ArrowRight size={15} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {agents.slice(0, 3).map((agent) => (
              <div key={agent.id} className="agent-card" style={{ background: '#181818', padding: '1.5rem', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="brand-mark" style={{ width: '36px', height: '36px' }}><Bot size={18} /></div>
                    <div>
                      <strong style={{ fontSize: '1.1rem', display: 'block' }}>{agent.name}</strong>
                      <small style={{ color: '#888' }}>ID #{agent.id} · Vault {agent.vault?.slice(0, 6)}...{agent.vault?.slice(-4)}</small>
                    </div>
                  </div>
                  <span className={`status-badge ${agent.status}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#252525' }}>
                    {agent.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: '1rem 0', padding: '0.75rem', background: '#121212', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#888', display: 'block' }}>TREASURY</span>
                    <strong style={{ fontSize: '1rem' }}>{agent.treasuryBalance || '0.00'} BOT</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#888', display: 'block' }}>FUNDED</span>
                    <strong style={{ fontSize: '1rem' }}>{agent.currentFunding || '0.00'} / {agent.fundingTarget} BOT</strong>
                  </div>
                </div>
                <button className="button button-dark full-button" onClick={() => onFund(agent)}>
                  <Wallet size={14} /> Fund Agent Economy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="loop-section section-pad">
        <div className="section-kicker">THE AGENT ECONOMY <span>01</span></div>
        <div className="loop-row">
          {['CREATE', 'CONFIGURE', 'FUND', 'OPERATE', 'EARN', 'DISTRIBUTE'].map((item, i) => (
            <div className="loop-item" key={item}>
              <span className="loop-number">0{i + 1}</span>
              <strong>{item}</strong>
              {i < 5 && <ArrowRight size={16} />}
            </div>
          ))}
        </div>
      </section>

      <section className="comparison section-pad">
        <div className="section-intro">
          <div className="section-kicker">THE DIFFERENCE <span>02</span></div>
          <h2>Not a token<br /><em>launchpad.</em></h2>
          <p>AgentForge packages the operational economy of an AI agent. The token is not the product. The service is.</p>
        </div>
        <div className="compare-stack">
          <div className="compare-card muted">
            <span>TRADITIONAL LAUNCHPAD</span>
            <div><strong>Token</strong><ArrowRight /><strong>Liquidity</strong><ArrowRight /><strong>Speculation</strong></div>
            <small>Capital with nowhere to go.</small>
          </div>
          <div className="compare-card accent">
            <span>AGENTFORGE</span>
            <div><strong>Agent</strong><ArrowRight /><strong>Treasury</strong><ArrowRight /><strong>Policy</strong><ArrowRight /><strong>Service</strong><ArrowRight /><strong>Revenue</strong></div>
            <small>Economic infrastructure for work.</small>
          </div>
        </div>
      </section>

      <section className="primitives section-pad">
        <div className="primitives-heading">
          <div className="section-kicker">THE PRIMITIVES <span>03</span></div>
          <h2>Everything an agent<br /><em>needs to operate.</em></h2>
        </div>
        <div className="primitive-grid">
          {primitives.map(([number, title, text]) => (
            <div className="primitive" key={title}>
              <span className="primitive-no">{number}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <ArrowUpRight size={16} />
            </div>
          ))}
        </div>
      </section>

      <section className="how-section section-pad">
        <div className="section-kicker">FROM PROMPT TO PROTOCOL <span>04</span></div>
        <div className="how-grid">
          <div>
            <h2>Give your agent<br /><em>an economic body.</em></h2>
            <p>Define what it does, how it gets funded, what it can touch and where the value goes. Then put the whole system on-chain.</p>
            <button className="text-arrow" onClick={() => go('launch')}>Start a launch <ArrowUpRight size={15} /></button>
          </div>
          <div className="how-steps">
            {[
              ['01', 'Define the service', 'Make the agent’s job legible to users and capital.'],
              ['02', 'Set the rails', 'Treasury, permissions and limits before execution.'],
              ['03', 'Open the round', 'Let users fund the work they want to see exist.'],
              ['04', 'Let it operate', 'Revenue returns to the system that created it.']
            ].map(([n, t, d]) => (
              <div className="how-step" key={n}>
                <span>{n}</span>
                <div><strong>{t}</strong><p>{d}</p></div>
                <ArrowRight size={15} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta section-pad">
        <div>
          <div className="section-kicker">THE NEXT CLASS OF SOFTWARE <span>05</span></div>
          <h2>Make the agent<br /><em>economically real.</em></h2>
        </div>
        <button className="button button-light" onClick={() => go('launch')}>
          Launch an Agent <ArrowUpRight size={16} />
        </button>
      </section>
    </main>
  );
}

function Explore({
  agents, loading, onRefresh, onFund, onPayRevenue, onSelect, onLaunch
}: {
  agents: AgentSummary[];
  loading: boolean;
  onRefresh: () => void;
  onFund: (agent: AgentSummary) => void;
  onPayRevenue: (agent: AgentSummary) => void;
  onSelect: (agent: AgentSummary) => void;
  onLaunch: () => void;
}) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
                          (a.vault && a.vault.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;
      if (filter === 'All') return true;
      if (filter === 'Live') return !a.isPaused;
      if (filter === 'Funding') return a.status === 'funding';
      if (filter === 'Operating') return a.status === 'operating';
      if (filter === 'Revenue') return a.status === 'revenue';
      return true;
    });
  }, [agents, filter, search]);

  return (
    <main className="page section-pad">
      <div className="page-heading">
        <div>
          <div className="section-kicker">AGENT DIRECTORY <span>LIVE REGISTRY</span></div>
          <h1>Explore agents.</h1>
          <p>Discover real on-chain AI agent economies registered on BOT Chain Mainnet.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="button button-ghost" onClick={onRefresh} disabled={loading} title="Refresh on-chain data">
            <RefreshCw size={15} className={loading ? 'pulse' : ''} />
            {loading ? 'Syncing...' : 'Sync Registry'}
          </button>
          <button className="button button-dark" onClick={onLaunch}>
            <Plus size={15} />Launch Agent
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-field">
          <Compass size={16} />
          <input
            placeholder="Search by agent name or vault address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-row">
          {['All', 'Live', 'Funding', 'Operating', 'Revenue'].map((item) => (
            <button
              key={item}
              className={filter === item ? 'filter active' : 'filter'}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-directory">
          <div className="empty-icon"><RefreshCw size={25} className="pulse" /></div>
          <h2>Querying BOT Chain Mainnet...</h2>
          <p>Fetching deployed agents from factory {CONTRACT_CONFIG.factoryAddress}...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-directory">
          <div className="empty-icon"><Network size={25} /></div>
          <h2>No matching agents found.</h2>
          <p>Be the first to launch an agent economy on BOT Chain mainnet.</p>
          <button className="button button-dark" onClick={onLaunch}>
            Launch an Agent <ArrowUpRight size={15} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {filtered.map((agent) => (
            <div
              key={agent.id}
              className="agent-card"
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="brand-mark" style={{ width: '40px', height: '40px' }}><Bot size={20} /></div>
                    <div>
                      <strong style={{ fontSize: '1.15rem', display: 'block' }}>{agent.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>
                        ID #{agent.id} · Vault: {agent.vault?.slice(0, 6)}...{agent.vault?.slice(-4)}
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      background: agent.isPaused ? '#442222' : agent.status === 'revenue' ? '#224422' : '#223344',
                      color: agent.isPaused ? '#ff6666' : agent.status === 'revenue' ? '#66ff66' : '#66aaff'
                    }}
                  >
                    {agent.isPaused ? 'PAUSED' : agent.status}
                  </span>
                </div>

                <p style={{ fontSize: '0.88rem', color: '#aaa', margin: '0.5rem 0 1rem', lineHeight: 1.4 }}>
                  {agent.service}
                </p>

                <div style={{ background: '#101010', borderRadius: '8px', padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#777', display: 'block' }}>TREASURY BALANCE</span>
                    <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{agent.treasuryBalance || '0.00'} BOT</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#777', display: 'block' }}>FUNDING TARGET</span>
                    <strong style={{ fontSize: '1.1rem', color: '#ddd' }}>{agent.fundingTarget || '—'} BOT</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#777', display: 'block' }}>TOTAL FUNDED</span>
                    <span style={{ fontSize: '0.95rem', color: '#bbb' }}>{agent.currentFunding || '0.00'} BOT</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#777', display: 'block' }}>TOTAL REVENUE</span>
                    <span style={{ fontSize: '0.95rem', color: '#8f8' }}>{agent.totalRevenue || '0.00'} BOT</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1.2rem' }}>
                  <div>Max / Tx: <strong>{agent.maxPerTx} BOT</strong> · Daily Limit: <strong>{agent.dailyLimit} BOT</strong></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <button className="button button-dark" onClick={() => onFund(agent)}>
                  <Wallet size={14} /> Fund
                </button>
                <button className="button button-outline" onClick={() => onPayRevenue(agent)}>
                  <DollarSign size={14} /> Pay Service
                </button>
                <button
                  className="button button-ghost"
                  style={{ gridColumn: 'span 2' }}
                  onClick={() => onSelect(agent)}
                >
                  Inspect Treasury & Policy <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="directory-foot">
        <span>{agents.length} AGENTS REGISTERED ON-CHAIN</span>
        <span>FACTORY: <a href={`${BOT_CHAIN.explorerUrl}/address/${CONTRACT_CONFIG.factoryAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{CONTRACT_CONFIG.factoryAddress}</a></span>
      </div>
    </main>
  );
}

function LaunchWizard({
  step, setStep, draft, setDraft, txState, onLaunch, onConnect, wallet, onViewAgent
}: {
  step: number;
  setStep: (step: number) => void;
  draft: LaunchDraft;
  setDraft: (draft: LaunchDraft) => void;
  txState: TransactionState;
  onLaunch: () => void;
  onConnect: () => void;
  wallet: WalletState;
  onViewAgent: () => void;
}) {
  const canNext = step === 6 || (step === 0 ? draft.identity.name.trim().length > 0 : true);
  const update = (section: keyof LaunchDraft, field: string, value: string | boolean) => {
    setDraft({ ...draft, [section]: { ...draft[section], [field]: value } });
  };

  return (
    <main className="launch-page section-pad">
      <div className="page-heading launch-heading">
        <div>
          <div className="section-kicker">AGENT LAUNCH PROTOCOL <span>MAINNET DEPLOYMENT</span></div>
          <h1>Launch an agent.</h1>
          <p>Configure the rails before deploying the economy to BOT Chain mainnet.</p>
        </div>
        <div className="launch-status">
          <span className="pulse" />
          TARGET: BOT CHAIN (677)
        </div>
      </div>

      <div className="wizard-shell">
        <aside className="wizard-sidebar">
          <div className="wizard-label">LAUNCH SEQUENCE</div>
          {launchSteps.map((label, i) => (
            <button
              key={label}
              className={step === i ? 'wizard-step current' : step > i ? 'wizard-step complete' : 'wizard-step'}
              onClick={() => step > i && setStep(i)}
            >
              <span>{step > i ? <Check size={13} /> : `0${i + 1}`}</span>
              <strong>{label}</strong>
              {step === i && <ArrowRight size={14} />}
            </button>
          ))}
          <div className="sidebar-note">
            <ShieldCheck size={17} />
            <p>Deploys a dedicated ERC-1167 isolated AgentVault with immutable policy rails.</p>
          </div>
        </aside>

        <section className="wizard-content">
          {step < 6 && <WizardForm step={step} draft={draft} update={update} />}
          {step === 6 && <Review draft={draft} txState={txState} />}

          {txState.status !== 'success' && (
            <div className="wizard-actions">
              <button
                className="button button-ghost"
                onClick={() => step > 0 && setStep(step - 1)}
                disabled={step === 0 || txState.status === 'preparing'}
              >
                Back
              </button>
              {step === 6 ? (
                wallet.status === 'connected' ? (
                  <button
                    className="button button-dark launch-button"
                    disabled={txState.status === 'preparing'}
                    onClick={onLaunch}
                  >
                    {txState.status === 'preparing' ? (
                      <>Deploying to Mainnet... <RefreshCw size={15} className="pulse" /></>
                    ) : (
                      <>Launch on BOT Chain Mainnet <ArrowUpRight size={16} /></>
                    )}
                  </button>
                ) : (
                  <button className="button button-dark" onClick={onConnect}>
                    <Wallet size={15} /> Connect wallet to launch
                  </button>
                )
              ) : (
                <button
                  className="button button-dark"
                  disabled={!canNext}
                  onClick={() => setStep(Math.min(6, step + 1))}
                >
                  Continue <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}

          {txState.status === 'failed' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#331111', border: '1px solid #772222', borderRadius: '8px', color: '#ffaaaa', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <AlertCircle size={18} />
              <div>
                <strong>Launch transaction failed</strong>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>{txState.error}</p>
              </div>
            </div>
          )}

          {txState.status === 'success' && (
            <div className="launch-success">
              <div className="success-mark"><Check size={22} /></div>
              <div>
                <div className="eyebrow">AGENT LIVE ON BOT CHAIN MAINNET</div>
                <h3>{draft.identity.name || 'Your agent'} is deployed!</h3>
                <p style={{ margin: '0.4rem 0' }}>
                  Transaction confirmed on BOT Chain:
                </p>
                {txState.hash && (
                  <a
                    href={`${BOT_CHAIN.explorerUrl}/tx/${txState.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#66aaff', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {txState.hash.slice(0, 16)}...{txState.hash.slice(-10)} <ExternalLink size={12} />
                  </a>
                )}
                {txState.vaultAddress && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#aaa' }}>
                    Vault Address: <code>{txState.vaultAddress}</code>
                  </div>
                )}
              </div>
              <button className="button button-dark" onClick={onViewAgent}>
                Explore in Registry <ArrowUpRight size={15} />
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function WizardForm({
  step, draft, update
}: {
  step: number;
  draft: LaunchDraft;
  update: (section: keyof LaunchDraft, field: string, value: string | boolean) => void;
}) {
  const configs = [
    {
      title: 'Give it an identity.',
      intro: 'Make the actor legible before you make it autonomous.',
      section: 'identity' as const,
      fields: [
        ['name', 'Agent name *', 'e.g. Nexus Sentinel', 'input'],
        ['description', 'Short description', 'What is this agent here to do?', 'textarea'],
        ['address', 'Execution address (optional)', '0x... agent wallet or your address', 'input']
      ]
    },
    {
      title: 'Define the service.',
      intro: 'A clear service gives the economy a reason to exist.',
      section: 'service' as const,
      fields: [
        ['description', 'What does the agent do?', 'e.g. Performs automated arbitrage and security auditing.', 'textarea'],
        ['customer', 'Who pays for it?', 'e.g. Protocols, trading desks, individual traders', 'input'],
        ['payment', 'Payment model', 'e.g. Per-call native BOT fee', 'input']
      ]
    },
    {
      title: 'Build the treasury.',
      intro: 'Give capital an isolated smart contract vault destination.',
      section: 'treasury' as const,
      fields: [
        ['purpose', 'Treasury purpose', 'e.g. Capital buffer for autonomous operation and gas fees', 'textarea'],
        ['asset', 'Funding asset', 'BOT (Native)', 'input'],
        ['destination', 'Recipient for distributions', '0x... creator or payout wallet', 'input']
      ]
    },
    {
      title: 'Set the guardrails.',
      intro: 'Autonomy is only useful when the boundaries are strictly enforced.',
      section: 'permissions' as const,
      fields: [
        ['targets', 'Allowed execution target (optional)', '0x... contract address or blank for open', 'input'],
        ['maxValue', 'Maximum BOT per transaction', 'e.g. 0.1', 'input'],
        ['dailyLimit', 'Daily spending limit (BOT)', 'e.g. 0.5', 'input'],
        ['expiry', 'Policy expiry (optional timestamp)', '0', 'input']
      ]
    },
    {
      title: 'Compose the economy.',
      intro: 'Choose how capital enters, how value is earned and where it returns.',
      section: 'economics' as const,
      fields: [
        ['target', 'Funding target (BOT)', 'e.g. 1.0', 'input'],
        ['minimum', 'Minimum contribution (BOT)', '0.001', 'input'],
        ['revenueModel', 'Revenue model', 'e.g. Usage fee', 'input'],
        ['distribution', 'Distribution model', 'Pro-rata to contributors', 'input']
      ]
    },
    {
      title: 'Define execution.',
      intro: 'The final policy is the contract between intent and action.',
      section: 'policy' as const,
      fields: [
        ['transactionLimit', 'Enforced max spend per tx (BOT)', '0.1', 'input'],
        ['dailyLimit', 'Enforced 24h spend cap (BOT)', '0.5', 'input'],
        ['status', 'Agent status after launch', 'Active after launch', 'input']
      ]
    },
  ];

  const config = configs[step];
  return (
    <div className="form-step">
      <div className="form-step-heading">
        <span className="step-index">0{step + 1}</span>
        <div><h2>{config.title}</h2><p>{config.intro}</p></div>
      </div>
      <div className="field-grid">
        {config.fields.map(([key, label, placeholder, type]) => (
          <label className={type === 'textarea' ? 'field full' : 'field'} key={key}>
            <span>{label}</span>
            {type === 'textarea' ? (
              <textarea
                value={String(config.section === 'identity' ? draft.identity[key as keyof typeof draft.identity] : draft[config.section][key as never] ?? '')}
                placeholder={placeholder}
                onChange={(e) => update(config.section, key, e.target.value)}
              />
            ) : (
              <input
                value={String(config.section === 'identity' ? draft.identity[key as keyof typeof draft.identity] : draft[config.section][key as never] ?? '')}
                placeholder={placeholder}
                onChange={(e) => update(config.section, key, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {(step === 3 || step === 5) && (
        <div className="security-callout">
          <ShieldCheck size={18} />
          <div>
            <strong>Emergency pause enabled</strong>
            <p>Creator retains atomic pause permissions to stop treasury outflows instantly.</p>
          </div>
          <button className="toggle on"><span /></button>
        </div>
      )}
    </div>
  );
}

function Review({ draft, txState }: { draft: LaunchDraft; txState: TransactionState }) {
  const reviewItems = useMemo(() => [
    ['AGENT', draft.identity.name || 'Nexus Sentinel', draft.identity.description || 'Autonomous on-chain agent.'],
    ['SERVICE', draft.service.description || 'Automated smart contract operations', draft.service.payment || 'BOT payments'],
    ['TREASURY', 'Isolated ERC-1167 Vault', 'Asset: Native BOT'],
    ['FUNDING', `${draft.economics.target || '1.0'} BOT Target`, draft.economics.distribution || 'Pro-rata to funders'],
    ['POLICY', `Max/Tx: ${draft.permissions.maxValue || '0.1'} BOT`, `Daily Limit: ${draft.permissions.dailyLimit || '0.5'} BOT`],
    ['CONTROLS', 'Emergency Pause Enabled', 'Creator-governed'],
  ], [draft]);

  return (
    <div className="review-step">
      <div className="form-step-heading">
        <span className="step-index">07</span>
        <div>
          <h2>Review the economy.</h2>
          <p>Everything will be deployed directly to the BOT Chain mainnet factory.</p>
        </div>
      </div>
      <div className="review-list">
        {reviewItems.map(([label, title, detail]) => (
          <div className="review-row" key={label}>
            <span>{label}</span>
            <div><strong>{title}</strong><small>{detail}</small></div>
            <Check size={16} className="review-check" />
          </div>
        ))}
      </div>
      <div className="chain-notice">
        <Network size={18} />
        <div>
          <strong>Ready for BOT Chain Mainnet (Chain ID {BOT_CHAIN.chainId})</strong>
          <span>Factory Contract: {CONTRACT_CONFIG.factoryAddress}</span>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  agents, wallet, onConnect, onLaunch, onTogglePause, onFund, onPayRevenue, onSelect
}: {
  agents: AgentSummary[];
  wallet: WalletState;
  onConnect: () => void;
  onLaunch: () => void;
  onTogglePause: (vault: string, isPaused: boolean) => void;
  onFund: (agent: AgentSummary) => void;
  onPayRevenue: (agent: AgentSummary) => void;
  onSelect: (agent: AgentSummary) => void;
}) {
  // Creator's agents
  const myAgents = useMemo(() => {
    if (!wallet.address) return [];
    return agents.filter(a => a.creator?.toLowerCase() === wallet.address?.toLowerCase());
  }, [agents, wallet.address]);

  // Overall protocol stats
  const totalTreasury = useMemo(() => {
    return agents.reduce((acc, a) => acc + parseFloat(a.treasuryBalance || '0'), 0).toFixed(4);
  }, [agents]);

  const totalFunded = useMemo(() => {
    return agents.reduce((acc, a) => acc + parseFloat(a.currentFunding || '0'), 0).toFixed(4);
  }, [agents]);

  const totalRevenue = useMemo(() => {
    return agents.reduce((acc, a) => acc + parseFloat(a.totalRevenue || '0'), 0).toFixed(4);
  }, [agents]);

  const totalDistributed = useMemo(() => {
    return agents.reduce((acc, a) => acc + parseFloat(a.totalDistributed || '0'), 0).toFixed(4);
  }, [agents]);

  return (
    <main className="page section-pad">
      <div className="page-heading">
        <div>
          <div className="section-kicker">CREATOR CONSOLE <span>OPERATOR VIEW</span></div>
          <h1>Your agents.</h1>
          <p>A control surface for the on-chain agent economies you deploy.</p>
        </div>
        <button className="button button-dark" onClick={onLaunch}>
          <Plus size={15} />Launch an agent
        </button>
      </div>

      <div className="stat-grid">
        {[
          ['NETWORK TREASURY', `${totalTreasury} BOT`, 'Held in isolated vaults'],
          ['TOTAL FUNDED', `${totalFunded} BOT`, 'Contributed by users'],
          ['SERVICE REVENUE', `${totalRevenue} BOT`, 'Earned by agents'],
          ['DISTRIBUTIONS', `${totalDistributed} BOT`, 'Returned to participants']
        ].map(([label, value, detail]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      {wallet.status !== 'connected' ? (
        <div className="dashboard-empty" style={{ marginTop: '2rem' }}>
          <div className="dashboard-art"><Wallet size={30} /><div className="scan-line" /></div>
          <div>
            <div className="eyebrow">WALLET NOT CONNECTED</div>
            <h2>Connect your wallet to manage your agents.</h2>
            <p>Connect your wallet to view and manage agents created by your address.</p>
            <button className="button button-dark" onClick={onConnect}>
              <Wallet size={15} /> Connect Wallet
            </button>
          </div>
        </div>
      ) : myAgents.length === 0 ? (
        <div className="dashboard-empty" style={{ marginTop: '2rem' }}>
          <div className="dashboard-art"><Gauge size={30} /><div className="scan-line" /></div>
          <div>
            <div className="eyebrow">NO AGENTS CREATED BY THIS WALLET</div>
            <h2>Your creator console has no deployed agents yet.</h2>
            <p>Deploy your first agent economy on BOT Chain mainnet to manage it here.</p>
            <button className="text-arrow" onClick={onLaunch}>Begin a launch <ArrowRight size={15} /></button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1rem' }}>Managed Agent Economies ({myAgents.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
            {myAgents.map((agent) => (
              <div key={agent.id} style={{ background: '#161616', border: '1px solid #282828', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <strong>{agent.name}</strong>
                  <button
                    className="button button-ghost"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => onTogglePause(agent.vault || '', Boolean(agent.isPaused))}
                  >
                    {agent.isPaused ? <><Play size={12} /> Unpause</> : <><Pause size={12} /> Emergency Pause</>}
                  </button>
                </div>
                <div style={{ background: '#101010', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div>Treasury: <strong>{agent.treasuryBalance} BOT</strong></div>
                  <div>Funded: <strong>{agent.currentFunding} / {agent.fundingTarget} BOT</strong></div>
                  <div>Revenue: <strong>{agent.totalRevenue} BOT</strong></div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="button button-dark" style={{ flex: 1 }} onClick={() => onFund(agent)}>Fund</button>
                  <button className="button button-outline" style={{ flex: 1 }} onClick={() => onPayRevenue(agent)}>Pay</button>
                  <button className="button button-ghost" style={{ flex: 1 }} onClick={() => onSelect(agent)}>Inspect</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function TreasuryView({
  agents, selected, onSelectAgent, onFund, onPayRevenue, onLaunch
}: {
  agents: AgentSummary[];
  selected: AgentSummary | null;
  onSelectAgent: (agent: AgentSummary) => void;
  onFund: (agent: AgentSummary) => void;
  onPayRevenue: (agent: AgentSummary) => void;
  onLaunch: () => void;
}) {
  const flow = [
    ['01 · FUNDING', 'Capital enters the launch round', Wallet],
    ['02 · TREASURY', 'Funds are held against policy', Landmark],
    ['03 · OPERATIONS', 'Agent executes approved work', Zap],
    ['04 · REVENUE', 'Service value returns to the system', ReceiptText],
    ['05 · DISTRIBUTIONS', 'Value flows back to participants', ArrowDownRight]
  ] as const;

  if (!selected && agents.length > 0) {
    selected = agents[0];
  }

  return (
    <main className="page section-pad">
      <div className="page-heading">
        <div>
          <div className="section-kicker">ECONOMIC LIFECYCLE <span>ON-CHAIN VAULT</span></div>
          <h1>Treasury flow.</h1>
          <p>See how an agent turns funding into accountable operations on BOT Chain.</p>
        </div>
        {agents.length > 1 && (
          <select
            value={selected?.id || ''}
            onChange={(e) => {
              const f = agents.find(a => a.id === e.target.value);
              if (f) onSelectAgent(f);
            }}
            style={{ background: '#222', color: '#fff', border: '1px solid #333', padding: '0.5rem 1rem', borderRadius: '6px' }}
          >
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} (#{a.id})</option>)}
          </select>
        )}
      </div>

      {selected ? (
        <div>
          <div style={{ background: '#151515', border: '1px solid #282828', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selected.name}</h2>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>
                  Vault: <a href={`${BOT_CHAIN.explorerUrl}/address/${selected.vault}`} target="_blank" rel="noopener noreferrer" style={{ color: '#66aaff' }}>{selected.vault}</a>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button className="button button-dark" onClick={() => onFund(selected!)}><Wallet size={14} /> Contribute</button>
                <button className="button button-outline" onClick={() => onPayRevenue(selected!)}><DollarSign size={14} /> Pay Revenue</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              <div className="stat-card">
                <span>TREASURY BALANCE</span>
                <strong>{selected.treasuryBalance || '0.00'} BOT</strong>
                <small>Current live balance</small>
              </div>
              <div className="stat-card">
                <span>TOTAL CONTRIBUTED</span>
                <strong>{selected.currentFunding || '0.00'} BOT</strong>
                <small>Target: {selected.fundingTarget} BOT</small>
              </div>
              <div className="stat-card">
                <span>SERVICE REVENUE</span>
                <strong>{selected.totalRevenue || '0.00'} BOT</strong>
                <small>Client payments</small>
              </div>
              <div className="stat-card">
                <span>DISTRIBUTIONS</span>
                <strong>{selected.totalDistributed || '0.00'} BOT</strong>
                <small>Paid to participants</small>
              </div>
            </div>
          </div>

          <div className="treasury-flow">
            {flow.map(([label, text, Icon], i) => (
              <div className="treasury-node" key={label}>
                <div className="treasury-icon"><Icon size={19} /></div>
                <div>
                  <span>{label}</span>
                  <strong>{text}</strong>
                </div>
                {i < flow.length - 1 && <ArrowDownRight className="flow-arrow" size={17} />}
              </div>
            ))}
          </div>

          <div className="data-empty-grid" style={{ marginTop: '2rem' }}>
            <div className="empty-panel" style={{ textAlign: 'left', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <ArrowDownRight size={18} />
                <h3 style={{ margin: 0 }}>Incoming Funds</h3>
              </div>
              <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>
                {parseFloat(selected.currentFunding || '0') > 0
                  ? `${selected.currentFunding} BOT contributed directly to vault ${selected.vault?.slice(0, 8)}...`
                  : 'Funding round open. Users can contribute native BOT directly.'}
              </p>
            </div>
            <div className="empty-panel" style={{ textAlign: 'left', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Zap size={18} />
                <h3 style={{ margin: 0 }}>Execution Policy Rails</h3>
              </div>
              <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>
                Max per tx: <strong>{selected.maxPerTx} BOT</strong> · Daily limit: <strong>{selected.dailyLimit} BOT</strong>
              </p>
            </div>
            <div className="empty-panel" style={{ textAlign: 'left', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <ReceiptText size={18} />
                <h3 style={{ margin: 0 }}>Service Revenue & Distributions</h3>
              </div>
              <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>
                Total Revenue: <strong>{selected.totalRevenue} BOT</strong> · Distributed: <strong>{selected.totalDistributed} BOT</strong>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard-empty">
          <div className="dashboard-art"><Landmark size={30} /><div className="scan-line" /></div>
          <div>
            <div className="eyebrow">NO AGENT SELECTED</div>
            <h2>No agent economy selected.</h2>
            <p>Launch an agent or select an existing agent from the explore page.</p>
            <button className="button button-dark" onClick={onLaunch}>Launch Agent</button>
          </div>
        </div>
      )}
    </main>
  );
}

function FundingModal({
  agent, onClose, wallet, onConnect, onConfirm
}: {
  agent: AgentSummary;
  onClose: () => void;
  wallet: WalletState;
  onConnect: () => void;
  onConfirm: (amount: string) => Promise<TransactionState>;
}) {
  const [amount, setAmount] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<TransactionState | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await onConfirm(amount);
      setRes(result);
    } catch (e: any) {
      setRes({ status: 'failed', error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="fund-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="eyebrow">CONTRIBUTE TO AGENT ECONOMY</div>
        <h2>Fund {agent.name}</h2>
        <p className="modal-copy">
          Contribute native BOT to the agent’s isolated on-chain treasury vault on BOT Chain.
        </p>

        <div className="fund-agent">
          <div className="agent-avatar"><Bot size={20} /></div>
          <div>
            <strong>{agent.name} (ID #{agent.id})</strong>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>
              Vault: {agent.vault?.slice(0, 10)}...{agent.vault?.slice(-8)}
            </span>
          </div>
          <span className="status-tag" style={{ textTransform: 'uppercase' }}>{agent.status}</span>
        </div>

        <div className="fund-summary">
          <div>
            <span>CURRENT TREASURY</span>
            <strong>{agent.treasuryBalance || '0.00'} BOT</strong>
          </div>
          <div>
            <span>TARGET</span>
            <strong>{agent.fundingTarget || '—'} BOT</strong>
          </div>
        </div>

        <label className="field" style={{ margin: '1rem 0' }}>
          <span>YOUR CONTRIBUTION (BOT)</span>
          <div className="amount-input">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              type="number"
              step="0.001"
              disabled={loading}
            />
            <b>BOT</b>
          </div>
        </label>

        {res?.status === 'success' ? (
          <div className="modal-success" style={{ margin: '1rem 0' }}>
            <Check size={17} />
            <span>Funding confirmed on BOT Chain!</span>
            {res.hash && (
              <a
                href={`${BOT_CHAIN.explorerUrl}/tx/${res.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', fontSize: '0.8rem', color: '#88ee88', marginTop: '0.2rem' }}
              >
                View tx: {res.hash.slice(0, 10)}... <ExternalLink size={11} />
              </a>
            )}
          </div>
        ) : res?.status === 'failed' ? (
          <div style={{ margin: '1rem 0', color: '#ff8888', fontSize: '0.85rem' }}>
            {res.error}
          </div>
        ) : null}

        {wallet.status !== 'connected' ? (
          <button className="button button-dark full-button" onClick={onConnect}>
            <Wallet size={15} /> Connect wallet to continue
          </button>
        ) : (
          <button
            className="button button-dark full-button"
            disabled={!amount || loading || parseFloat(amount) <= 0}
            onClick={handleSubmit}
          >
            {loading ? 'Submitting to BOT Chain...' : `Confirm & Fund ${amount} BOT`}
          </button>
        )}

        <small className="transaction-note">
          <ShieldCheck size={13} /> Direct on-chain transaction · Contract-enforced policy rails
        </small>
      </div>
    </div>
  );
}

function RevenueModal({
  agent, onClose, wallet, onConnect, onConfirm
}: {
  agent: AgentSummary;
  onClose: () => void;
  wallet: WalletState;
  onConnect: () => void;
  onConfirm: (amount: string) => Promise<TransactionState>;
}) {
  const [amount, setAmount] = useState('0.005');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<TransactionState | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await onConfirm(amount);
      setRes(result);
    } catch (e: any) {
      setRes({ status: 'failed', error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="fund-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="eyebrow">SERVICE PAYMENT</div>
        <h2>Pay Service for {agent.name}</h2>
        <p className="modal-copy">
          Pay revenue into the agent’s treasury for autonomous intelligence and task completion.
        </p>

        <div className="fund-agent">
          <div className="agent-avatar"><Zap size={20} /></div>
          <div>
            <strong>{agent.name}</strong>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>
              Service: On-chain intelligence & operations
            </span>
          </div>
        </div>

        <label className="field" style={{ margin: '1rem 0' }}>
          <span>PAYMENT AMOUNT (BOT)</span>
          <div className="amount-input">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.005"
              type="number"
              step="0.001"
              disabled={loading}
            />
            <b>BOT</b>
          </div>
        </label>

        {res?.status === 'success' ? (
          <div className="modal-success" style={{ margin: '1rem 0' }}>
            <Check size={17} />
            <span>Revenue payment confirmed on BOT Chain!</span>
          </div>
        ) : res?.status === 'failed' ? (
          <div style={{ margin: '1rem 0', color: '#ff8888', fontSize: '0.85rem' }}>
            {res.error}
          </div>
        ) : null}

        {wallet.status !== 'connected' ? (
          <button className="button button-dark full-button" onClick={onConnect}>
            <Wallet size={15} /> Connect wallet to continue
          </button>
        ) : (
          <button
            className="button button-dark full-button"
            disabled={!amount || loading || parseFloat(amount) <= 0}
            onClick={handleSubmit}
          >
            {loading ? 'Processing payment...' : `Pay ${amount} BOT`}
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
