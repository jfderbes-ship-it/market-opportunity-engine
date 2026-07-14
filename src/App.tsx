import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bookmark,
  ChartCandlestick,
  CheckCircle2,
  Clock3,
  Database,
  Filter,
  HelpCircle,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
  Zap
} from "lucide-react";
import { getMarketDataProvider, marketDataProviders, publicDataIntegrationNotes } from "./lib/marketProviders";
import { formatCompact, formatCurrency, formatMarketTimestamp, formatNumber, formatPercent } from "./lib/format";
import { loadPersonalWatchlist, normalizeSymbols, savePersonalWatchlist, TRIAL_SWING_WATCHLIST, WATCHLIST_LIMIT } from "./lib/watchlist";
import type {
  AlertEvent,
  FeedStatus,
  IndicatorPoint,
  MarketContext,
  MarketSnapshot,
  Opportunity,
  ProviderId,
  ScannerFilters,
  SignalSide,
  Timeframe
} from "./types";

const defaultFilters: ScannerFilters = {
  minScore: 60,
  side: "all",
  minRelativeVolume: 0,
  minAverageVolume: 0,
  priceMin: 4,
  priceMax: 12,
  excludeEarningsDays: 0,
  hideLiquidityWarnings: false,
  timeframe: "5m"
};

const TERM_HELP = {
  score: "Opportunity Score is an attention score from 0 to 100. Higher means more scanner conditions are aligned. It is not a profit probability.",
  rsi: "RSI measures momentum. In this strategy, below 25 is oversold for possible bounce setups and above 75 is overbought for possible pullback setups.",
  bollinger: "Bollinger Bands show a moving average plus upper/lower volatility bands. A band touch means price is stretched versus recent volatility.",
  divergence: "Divergence compares price swings to RSI swings. Bullish divergence means price makes a lower low while RSI makes a higher low. Bearish divergence is the reverse.",
  rvol: "Relative Volume currently compares a candle with the preceding 20 candles. It is a local-volume comparison, not yet a historical time-of-day volume baseline.",
  vwap: "VWAP is the volume-weighted average price. Reclaiming or rejecting VWAP can confirm that intraday control is shifting.",
  liquidity: "Liquidity warnings flag wide spreads, thin average volume, or low float. These can make alerts less reliable.",
  timeframe: "Timeframe controls the candle size used for indicators. Shorter timeframes react faster but are noisier.",
  side: "Bullish means possible bounce setup. Bearish means possible pullback setup. All shows both.",
  minScore: "Minimum score hides weaker setups. Use lower values to explore early conditions; use higher values for stricter alerts.",
  minRelativeVolume: "Minimum relative volume filters out quiet tickers. A value like 1.25 requires volume to be at least 25% above normal.",
  minAverageVolume: "Minimum average volume filters out thinly traded tickers that may have poor fills or unstable signals.",
  priceRange: "Price range filters tickers by current share price.",
  earnings: "Nearby earnings can overwhelm technical signals. This filter is active in mock mode; live earnings dates will remain unavailable until a verified calendar source is connected.",
  hideLiquidity: "Hide rows with liquidity warnings. Live bid-ask spread and float data will remain unavailable until a verified source is connected."
};

function App() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [draftFilters, setDraftFilters] = useState<ScannerFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<ScannerFilters>(defaultFilters);
  const [providerId, setProviderId] = useState<ProviderId>("mock");
  const [draftWatchlist, setDraftWatchlist] = useState<string[]>(loadPersonalWatchlist);
  const [appliedWatchlist, setAppliedWatchlist] = useState<string[]>(loadPersonalWatchlist);
  const [selectedSymbol, setSelectedSymbol] = useState("PLTR");
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const provider = useMemo(() => getMarketDataProvider(providerId), [providerId]);
  const filtersDirty = useMemo(() => !filtersEqual(draftFilters, appliedFilters), [draftFilters, appliedFilters]);
  const watchlistDirty = useMemo(() => !symbolsEqual(draftWatchlist, appliedWatchlist), [draftWatchlist, appliedWatchlist]);
  const runScanner = () => {
    setAppliedFilters(draftFilters);
    setAppliedWatchlist(draftWatchlist);
    setSearchNonce((value) => value + 1);
  };

  useEffect(() => {
    savePersonalWatchlist(draftWatchlist);
  }, [draftWatchlist]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setProviderError(null);

    provider
      .getSnapshot({
        timeframe: appliedFilters.timeframe,
        symbols: appliedWatchlist,
        priceMin: appliedFilters.priceMin,
        priceMax: appliedFilters.priceMax
      })
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }

        setSnapshot(nextSnapshot);
        setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
        const topSymbol = nextSnapshot.opportunities[0]?.symbol;
        setSelectedSymbol((currentSymbol) =>
          topSymbol && !nextSnapshot.opportunities.some((item) => item.symbol === currentSymbol) ? topSymbol : currentSymbol
        );
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setProviderError(error instanceof Error ? error.message : "The selected market data provider failed.");
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [appliedFilters.priceMax, appliedFilters.priceMin, appliedFilters.timeframe, appliedWatchlist, provider, searchNonce]);

  const filteredOpportunities = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.opportunities
      .filter((opportunity) => opportunity.score >= appliedFilters.minScore)
      .filter((opportunity) => appliedFilters.side === "all" || opportunity.side === appliedFilters.side)
      .filter((opportunity) => (opportunity.relativeVolume ?? 0) >= appliedFilters.minRelativeVolume)
      .filter((opportunity) => opportunity.meta.avgVolume >= appliedFilters.minAverageVolume)
      .filter((opportunity) => opportunity.currentPrice >= appliedFilters.priceMin && opportunity.currentPrice <= appliedFilters.priceMax)
      .filter((opportunity) => {
        if (appliedFilters.excludeEarningsDays === 0 || opportunity.meta.earningsInDays === null) {
          return true;
        }

        return opportunity.meta.earningsInDays > appliedFilters.excludeEarningsDays;
      })
      .filter((opportunity) => !appliedFilters.hideLiquidityWarnings || opportunity.liquidityWarning === null);
  }, [appliedFilters, snapshot]);

  const visibleOpportunities = useMemo(
    () => filteredOpportunities.map((opportunity, index) => ({ ...opportunity, rank: index + 1 })),
    [filteredOpportunities]
  );

  const selectedOpportunity = useMemo(() => {
    return visibleOpportunities.find((item) => item.symbol === selectedSymbol) ?? visibleOpportunities[0] ?? null;
  }, [selectedSymbol, visibleOpportunities]);

  if (!snapshot) {
    return <div className="loading">Loading scanner...</div>;
  }

  const isSimulated = snapshot.feedStatus.mode === "mock";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Bollinger + RSI strategy scanner</div>
          <h1>Market Opportunity Engine</h1>
        </div>
        <div className="topbar-actions">
          <button className="primary-action" type="button" onClick={runScanner} disabled={isLoading}>
            <RefreshCw size={16} />
            <span>{isLoading ? "Searching..." : filtersDirty ? "Apply Filters & Search" : "Search Again"}</span>
          </button>
          <StatusPill icon={<Database size={15} />} label={snapshot.feedStatus.providerLabel} tone="neutral" />
          <StatusPill icon={<RefreshCw size={15} />} label={snapshot.feedStatus.freshness} tone={snapshot.feedStatus.mode === "mock" ? "warning" : "safe"} />
          <StatusPill icon={<Clock3 size={15} />} label={`Updated ${lastRefresh || snapshot.timestamp}`} tone="neutral" />
          <StatusPill icon={<ShieldCheck size={15} />} label="Research only" tone="safe" />
        </div>
      </header>

      <section className="disclaimer">
        <Info size={17} />
        <span>
          This tool is for research and education only. It does not provide financial advice, investment recommendations,
          automatic trade execution, or guaranteed outcomes. Alerts are probabilistic watchlist events.
        </span>
      </section>

      <main className="dashboard-grid">
        <section className="left-column">
          <OpportunityCards opportunities={visibleOpportunities.slice(0, 3)} onSelect={setSelectedSymbol} selectedSymbol={selectedOpportunity?.symbol ?? null} />
          <ScannerTable
            opportunities={visibleOpportunities}
            selectedSymbol={selectedOpportunity?.symbol ?? null}
            isSimulated={isSimulated}
            onSelect={setSelectedSymbol}
          />
        </section>

        <aside className="right-column">
          <ProviderPanel
            providerId={providerId}
            feedStatus={snapshot.feedStatus}
            isLoading={isLoading}
            error={providerError}
            onChange={setProviderId}
          />
          <WatchlistPanel
            symbols={draftWatchlist}
            isDirty={watchlistDirty}
            isLoading={isLoading}
            providerId={providerId}
            onChange={setDraftWatchlist}
            onApply={runScanner}
          />
          <FiltersPanel
            filters={draftFilters}
            appliedFilters={appliedFilters}
            isDirty={filtersDirty}
            isLoading={isLoading}
            onChange={setDraftFilters}
            onApply={runScanner}
            onReset={() => setDraftFilters(appliedFilters)}
          />
          <MarketContextPanel context={snapshot.context} />
          <AlertFeed opportunities={visibleOpportunities} isSimulated={isSimulated} />
          <DataPlanPanel />
        </aside>

        <section className="detail-column">
          {selectedOpportunity ? <TickerDetail opportunity={selectedOpportunity} isSimulated={isSimulated} /> : <NoSelectionPanel />}
        </section>
      </main>
    </div>
  );
}

function StatusPill({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "neutral" | "safe" | "warning" }) {
  return (
    <div className={`status-pill ${tone}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ProviderPanel({
  providerId,
  feedStatus,
  isLoading,
  error,
  onChange
}: {
  providerId: ProviderId;
  feedStatus: FeedStatus;
  isLoading: boolean;
  error: string | null;
  onChange: (providerId: ProviderId) => void;
}) {
  const selectedProvider = marketDataProviders.find((provider) => provider.id === providerId) ?? marketDataProviders[0];
  const configured =
    selectedProvider.id === "alpaca-delayed-sip"
      ? feedStatus.providerId === selectedProvider.id && feedStatus.configured
      : selectedProvider.configured;

  return (
    <section className="panel provider-panel">
      <PanelHeading icon={<Database size={18} />} title="Data Feed" detail={isLoading ? "Loading..." : feedStatus.freshness} />
      <label>
        <FieldLabel label="Provider" help="Mock is simulated. Public Yahoo Chart is an experimental no-key feed with variable timing. Alpaca uses delayed consolidated market data through the local server, so the browser never receives API credentials." />
        <select value={providerId} onChange={(event) => onChange(event.target.value as ProviderId)}>
          {marketDataProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
              {provider.id === "alpaca-delayed-sip" ? " - server setup" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className={`provider-status ${configured ? "configured" : "missing"}`}>
        {configured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <span>{configured ? "Configured" : selectedProvider.id === "alpaca-delayed-sip" ? "Server credentials required" : "Configured"}</span>
      </div>
      <p>{selectedProvider.description}</p>
      <div className="scan-coverage">
        <div>
          <span>Coverage</span>
          <strong>{feedStatus.coverage.completedSymbols} of {feedStatus.coverage.requestedSymbols} watchlist symbols scanned</strong>
        </div>
        <div>
          <span>Price eligible</span>
          <strong>{feedStatus.coverage.priceEligibleSymbols} within active price range</strong>
        </div>
        <div>
          <span>Newest candle</span>
          <strong>{feedStatus.mode === "mock" ? "Simulated" : formatMarketTimestamp(feedStatus.coverage.latestCandleAt)}</strong>
        </div>
        <div>
          <span>Metadata</span>
          <strong>{feedStatus.coverage.metadataStatus}</strong>
        </div>
      </div>
      {feedStatus.coverage.unavailableSymbols.length > 0 && (
        <div className="provider-error">
          <AlertTriangle size={16} />
          <span>Unavailable this scan: {feedStatus.coverage.unavailableSymbols.join(", ")}</span>
        </div>
      )}
      {selectedProvider.sourceUrl && (
        <a href={selectedProvider.sourceUrl} target="_blank" rel="noreferrer">
          Provider documentation
        </a>
      )}
      {error && (
        <div className="provider-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

function WatchlistPanel({
  symbols,
  isDirty,
  isLoading,
  providerId,
  onChange,
  onApply
}: {
  symbols: string[];
  isDirty: boolean;
  isLoading: boolean;
  providerId: ProviderId;
  onChange: (symbols: string[]) => void;
  onApply: () => void;
}) {
  const [entry, setEntry] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const addSymbols = () => {
    const additions = normalizeSymbols(entry);
    const nextSymbols = normalizeSymbols([...symbols, ...additions]);
    if (additions.length === 0) {
      setEntryError("Enter valid ticker symbols separated by commas.");
      return;
    }
    if (nextSymbols.length === symbols.length) {
      setEntryError(symbols.length >= WATCHLIST_LIMIT ? "The personal watchlist is limited to 50 symbols." : "Those symbols are already selected.");
      return;
    }

    onChange(nextSymbols);
    setEntry("");
    setEntryError(nextSymbols.length >= WATCHLIST_LIMIT ? "Trial limit reached: remove a symbol before adding another." : null);
  };
  const removeSymbol = (symbol: string) => {
    onChange(symbols.filter((item) => item !== symbol));
    setEntryError(null);
  };
  const restoreTrialWatchlist = () => {
    onChange([...TRIAL_SWING_WATCHLIST]);
    setEntryError(null);
  };

  return (
    <section className="panel watchlist-panel">
      <PanelHeading icon={<Bookmark size={18} />} title="Personal Watchlist" detail={`${symbols.length} of ${WATCHLIST_LIMIT} selected`} />
      <p>
        Saved in this browser. The trial symbols are research candidates, not a claim that they currently meet the active price or liquidity filters.
      </p>
      <label>
        <FieldLabel label="Add symbols" help="Add one or more exchange ticker symbols separated by commas. Personal selections persist until you remove them." />
        <div className="watchlist-entry">
          <input
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSymbols();
              }
            }}
            placeholder="Example: ACHR, JOBY"
            aria-describedby={entryError ? "watchlist-entry-error" : undefined}
          />
          <button className="secondary-action icon-text-action" type="button" onClick={addSymbols} disabled={isLoading}>
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
      </label>
      {entryError && <div className="watchlist-error" id="watchlist-entry-error">{entryError}</div>}
      <div className="symbol-list" aria-label="Selected personal watchlist symbols">
        {symbols.map((symbol) => (
          <span className="symbol-chip" key={symbol}>
            {symbol}
            <button type="button" aria-label={`Remove ${symbol} from personal watchlist`} title={`Remove ${symbol}`} onClick={() => removeSymbol(symbol)} disabled={isLoading}>
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="watchlist-actions">
        <button className="secondary-action" type="button" onClick={restoreTrialWatchlist} disabled={isLoading}>
          <RotateCcw size={15} />
          <span>Restore Trial 50</span>
        </button>
        <button className="primary-action" type="button" onClick={onApply} disabled={isLoading || symbols.length === 0}>
          <RefreshCw size={16} />
          <span>{isLoading ? "Searching..." : isDirty ? "Use Watchlist" : "Search Watchlist"}</span>
        </button>
      </div>
      <small>{providerId === "mock" ? "Mock mode keeps its fixed demonstration universe. Public providers use the selected list." : "Price eligibility is checked before daily-volume analysis for public providers."}</small>
    </section>
  );
}

function OpportunityCards({
  opportunities,
  onSelect,
  selectedSymbol
}: {
  opportunities: Opportunity[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string | null;
}) {
  return (
    <section className="panel">
      <PanelHeading icon={<Zap size={18} />} title="Top Opportunities" detail="Ranked by attention priority" />
      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities match the active filters" detail="Lower a filter threshold or change the setup side, then run the scan again." />
      ) : (
      <div className="card-grid">
        {opportunities.map((opportunity) => (
          <button
            className={`opportunity-card ${opportunity.side} ${selectedSymbol === opportunity.symbol ? "selected" : ""}`}
            key={opportunity.symbol}
            onClick={() => onSelect(opportunity.symbol)}
          >
            <div className="card-topline">
              <span className="ticker">{opportunity.symbol}</span>
              <ScoreBadge score={opportunity.score} />
            </div>
            <div className="company-name">{opportunity.companyName}</div>
            <div className="signal-row">
              <SideIcon side={opportunity.side} />
              <span>{opportunity.signalType}</span>
            </div>
            <div className="metric-strip">
              <span>RSI {formatNumber(opportunity.rsi, 1)}</span>
              <span>RVOL {formatNumber(opportunity.relativeVolume, 2)}x</span>
              <span>{opportunity.vwapStatus}</span>
            </div>
          </button>
        ))}
      </div>
      )}
    </section>
  );
}

function ScannerTable({
  opportunities,
  selectedSymbol,
  isSimulated,
  onSelect
}: {
  opportunities: Opportunity[];
  selectedSymbol: string | null;
  isSimulated: boolean;
  onSelect: (symbol: string) => void;
}) {
  return (
    <section className="panel table-panel">
      <PanelHeading
        icon={<ChartCandlestick size={18} />}
        title="Ranked Scanner"
        detail={`${opportunities.length} symbols matching filters`}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Ticker</th>
              <th>Signal</th>
              <th><InlineHelp label="Score" help={TERM_HELP.score} /></th>
              <th><InlineHelp label="RSI" help={TERM_HELP.rsi} /></th>
              <th><InlineHelp label="Bollinger" help={TERM_HELP.bollinger} /></th>
              <th><InlineHelp label="Divergence" help={TERM_HELP.divergence} /></th>
              <th><InlineHelp label="RVOL" help={TERM_HELP.rvol} /></th>
              <th><InlineHelp label="VWAP" help={TERM_HELP.vwap} /></th>
              <th><InlineHelp label="Liquidity" help={TERM_HELP.liquidity} /></th>
              <th><InlineHelp label="Candle time" help="Time of the most recent candle used for this signal. Simulated data does not show a real market timestamp." /></th>
            </tr>
          </thead>
          <tbody>
            {opportunities.length === 0 && (
              <tr className="empty-table-row">
                <td colSpan={11}>No symbols match the active filters. The scanner is intentionally not showing substitute rows.</td>
              </tr>
            )}
            {opportunities.map((opportunity) => (
              <tr
                key={opportunity.symbol}
                className={selectedSymbol === opportunity.symbol ? "selected-row" : ""}
                onClick={() => onSelect(opportunity.symbol)}
              >
                <td>{opportunity.rank}</td>
                <td>
                  <div className="ticker-cell">
                    <strong>{opportunity.symbol}</strong>
                    <span>{opportunity.companyName}</span>
                  </div>
                </td>
                <td>
                  <SignalTag side={opportunity.side} label={opportunity.signalType} />
                </td>
                <td>
                  <ScoreBadge score={opportunity.score} />
                </td>
                <td>{formatNumber(opportunity.rsi, 1)}</td>
                <td>{opportunity.bollingerStatus}</td>
                <td>{opportunity.divergence.type}</td>
                <td>{formatNumber(opportunity.relativeVolume, 2)}x</td>
                <td>{opportunity.vwapStatus}</td>
                <td>{opportunity.liquidityWarning ?? "Clear"}</td>
                <td>{isSimulated ? "Simulated" : formatMarketTimestamp(opportunity.lastUpdated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FiltersPanel({
  filters,
  appliedFilters,
  isDirty,
  isLoading,
  onChange,
  onApply,
  onReset
}: {
  filters: ScannerFilters;
  appliedFilters: ScannerFilters;
  isDirty: boolean;
  isLoading: boolean;
  onChange: (filters: ScannerFilters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const update = <K extends keyof ScannerFilters>(key: K, value: ScannerFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <section className="panel filter-panel">
      <PanelHeading icon={<Filter size={18} />} title="Filters" detail={isDirty ? "Pending changes" : "Applied"} />
      <div className="filter-state">
        <span>Applied: score {appliedFilters.minScore}+, {appliedFilters.side}, {appliedFilters.timeframe}</span>
      </div>
      <label>
        <FieldLabel label="Minimum score" help={TERM_HELP.minScore} />
        <input type="range" min="0" max="100" step="5" value={filters.minScore} onChange={(event) => update("minScore", Number(event.target.value))} />
        <strong>{filters.minScore}</strong>
      </label>
      <label>
        <FieldLabel label="Setup side" help={TERM_HELP.side} />
        <select value={filters.side} onChange={(event) => update("side", event.target.value as ScannerFilters["side"])}>
          <option value="all">All setups</option>
          <option value="bullish">Bullish only</option>
          <option value="bearish">Bearish only</option>
        </select>
      </label>
      <label>
        <FieldLabel label="Minimum relative volume" help={TERM_HELP.minRelativeVolume} />
        <input
          type="number"
          min="0"
          step="0.25"
          value={filters.minRelativeVolume}
          onChange={(event) => update("minRelativeVolume", Number(event.target.value))}
        />
      </label>
      <label>
        <FieldLabel label="Minimum average volume" help={TERM_HELP.minAverageVolume} />
        <select value={filters.minAverageVolume} onChange={(event) => update("minAverageVolume", Number(event.target.value))}>
          <option value={0}>Any</option>
          <option value={500000}>500K</option>
          <option value={1000000}>1M</option>
          <option value={5000000}>5M</option>
          <option value={10000000}>10M</option>
        </select>
      </label>
      <div className="two-inputs">
        <label>
          <FieldLabel label="Min price" help={TERM_HELP.priceRange} />
          <input type="number" min="0" value={filters.priceMin} onChange={(event) => update("priceMin", Number(event.target.value))} />
        </label>
        <label>
          <FieldLabel label="Max price" help={TERM_HELP.priceRange} />
          <input type="number" min="0" value={filters.priceMax} onChange={(event) => update("priceMax", Number(event.target.value))} />
        </label>
      </div>
      <label>
        <FieldLabel label="Exclude earnings within" help={TERM_HELP.earnings} />
        <select value={filters.excludeEarningsDays} onChange={(event) => update("excludeEarningsDays", Number(event.target.value))}>
          <option value={0}>No exclusion</option>
          <option value={3}>3 days</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
        </select>
      </label>
      <label>
        <FieldLabel label="Timeframe" help={TERM_HELP.timeframe} />
        <select value={filters.timeframe} onChange={(event) => update("timeframe", event.target.value as Timeframe)}>
          <option value="1m">1 minute</option>
          <option value="5m">5 minute</option>
          <option value="15m">15 minute</option>
          <option value="1h">1 hour</option>
          <option value="1d">Daily</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.hideLiquidityWarnings}
          onChange={(event) => update("hideLiquidityWarnings", event.target.checked)}
        />
        <FieldLabel label="Hide liquidity warnings" help={TERM_HELP.hideLiquidity} />
      </label>
      <div className="filter-actions">
        <button className="primary-action full" type="button" onClick={onApply} disabled={isLoading}>
          <RefreshCw size={16} />
          <span>{isLoading ? "Searching..." : isDirty ? "Apply Filters & Search" : "Search Again"}</span>
        </button>
        <button className="secondary-action" type="button" onClick={onReset} disabled={!isDirty || isLoading}>
          Revert Pending
        </button>
      </div>
    </section>
  );
}

function MarketContextPanel({ context }: { context: MarketContext[] }) {
  return (
    <section className="panel">
      <PanelHeading icon={<Activity size={18} />} title="Market Context" detail="Confidence modifier" />
      <div className="context-list">
        {context.map((item) => (
          <div className="context-row" key={item.symbol}>
            <div>
              <strong>{item.symbol}</strong>
              <span>{item.note}</span>
            </div>
            <div className="context-values">
              <span className={item.changePercent >= 0 ? "positive" : "negative"}>{formatPercent(item.changePercent)}</span>
              <span>{item.trend}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertFeed({ opportunities, isSimulated }: { opportunities: Opportunity[]; isSimulated: boolean }) {
  const feed = opportunities
    .filter((opportunity) => opportunity.score >= 60)
    .slice(0, 8)
    .map((opportunity) => ({
      time: opportunity.lastUpdated,
      symbol: opportunity.symbol,
      label: opportunity.signalType,
      score: opportunity.score,
      side: opportunity.side
    }));

  return (
    <section className="panel">
      <PanelHeading icon={<Bell size={18} />} title="Alert Feed" detail="Latest watchlist events" />
      <div className="feed-list">
        {feed.length === 0 && <EmptyState title="No current watchlist events" detail="The active filters did not leave any qualifying signals." />}
        {feed.map((item) => (
          <div className="feed-row" key={`${item.symbol}-${item.label}`}>
            <span>{isSimulated ? "Simulated" : formatMarketTimestamp(item.time)}</span>
            <strong>{item.symbol}</strong>
            <SignalTag side={item.side} label={item.label} />
            <ScoreBadge score={item.score} />
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function NoSelectionPanel() {
  return (
    <section className="panel empty-detail">
      <ChartCandlestick size={22} />
      <div>
        <h2>No ticker selected</h2>
        <p>Run a scan with filters that return at least one symbol to inspect its supporting data and reference zones.</p>
      </div>
    </section>
  );
}

function DataPlanPanel() {
  return (
    <section className="panel data-plan">
      <PanelHeading icon={<RefreshCw size={18} />} title="Data Path" detail="Mock first, provider later" />
      <ul>
        {publicDataIntegrationNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function TickerDetail({ opportunity, isSimulated }: { opportunity: Opportunity; isSimulated: boolean }) {
  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <div className="eyebrow">{opportunity.sector}</div>
          <h2>
            {opportunity.symbol} <span>{opportunity.companyName}</span>
          </h2>
        </div>
        <div className="detail-score">
          <ScoreBadge score={opportunity.score} />
          <SignalTag side={opportunity.side} label={opportunity.signalType} />
        </div>
      </div>

      <div className="detail-metrics">
        <Metric label="Price" value={formatCurrency(opportunity.currentPrice)} help="Latest candle close from the selected provider." />
        <Metric label="RSI 13" value={formatNumber(opportunity.rsi, 1)} help={TERM_HELP.rsi} />
        <Metric label="Bollinger" value={opportunity.bollingerStatus} help={TERM_HELP.bollinger} />
        <Metric label="Divergence" value={`${opportunity.divergence.type} ${opportunity.divergence.strength}/100`} help={TERM_HELP.divergence} />
        <Metric label="RVOL" value={`${formatNumber(opportunity.relativeVolume, 2)}x`} help={TERM_HELP.rvol} />
        <Metric label="Avg volume" value={formatCompact(opportunity.meta.avgVolume)} help="Average trading volume from the current ticker metadata. Higher is usually easier to trade cleanly." />
      </div>

      <div className="chart-stack">
        <PriceChart opportunity={opportunity} />
        <RsiChart data={opportunity.chartData} />
        <VolumeChart data={opportunity.chartData} />
      </div>

      <div className="detail-lower-grid">
        <section className="subpanel">
          <h3>Plain-English Explanation</h3>
          <p>{opportunity.explanation}</p>
          {opportunity.warnings.length > 0 && (
            <div className="warnings">
              {opportunity.warnings.map((warning) => (
                <div key={warning}>
                  <AlertTriangle size={15} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="subpanel">
          <h3>Risk Zones</h3>
          <div className="risk-grid">
            <Metric label="Possible invalidation" value={formatCurrency(opportunity.risk.invalidation)} help="A reference zone where the setup may no longer be valid. This is not a trading instruction." />
            <Metric label="Possible first target" value={formatCurrency(opportunity.risk.firstTarget)} help="A reference mean-reversion area such as mid-band, VWAP, or recent structure. Not a recommendation." />
            <Metric label="Possible second target" value={formatCurrency(opportunity.risk.secondTarget)} help="A farther reference area if mean reversion continues. Not a profit promise." />
            <Metric label="ATR" value={formatCurrency(opportunity.risk.atr)} help="Average True Range estimates recent price movement size. It helps scale risk zones to volatility." />
            <Metric label="R/R estimate" value={`${formatNumber(opportunity.risk.riskReward, 2)}x`} help="Rough reward-to-risk estimate based on the displayed reference zones. It is not a guarantee." />
          </div>
        </section>

        <section className="subpanel">
          <h3>Alert Timeline</h3>
          <Timeline events={opportunity.timeline} isSimulated={isSimulated} />
        </section>

        <section className="subpanel">
          <h3>Score Breakdown</h3>
          <ScoreBreakdown opportunity={opportunity} />
        </section>
      </div>
    </section>
  );
}

function PriceChart({ opportunity }: { opportunity: Opportunity }) {
  const data = opportunity.chartData.slice(-70);
  const values = data.flatMap((point) => [point.high, point.low, point.upperBand ?? point.high, point.lowerBand ?? point.low]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 720;
  const height = 260;
  const pad = 18;
  const xFor = (index: number) => pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2);
  const yFor = (value: number) => height - pad - ((value - min) / Math.max(max - min, 0.01)) * (height - pad * 2);
  const closePath = data.map((point, index) => `${xFor(index)},${yFor(point.close)}`).join(" ");
  const upperPath = nullablePath(data, xFor, yFor, "upperBand");
  const lowerPath = nullablePath(data, xFor, yFor, "lowerBand");
  const midPath = nullablePath(data, xFor, yFor, "sma");
  const offset = opportunity.chartData.length - data.length;

  return (
    <div className="chart-card">
      <div className="chart-title">
        <span>Price with Bollinger Bands and divergence markers</span>
        <span>{opportunity.timeframe}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${opportunity.symbol} price chart`}>
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <polyline points={upperPath} className="band upper" fill="none" />
        <polyline points={lowerPath} className="band lower" fill="none" />
        <polyline points={midPath} className="band mid" fill="none" />
        {data.map((point, index) => {
          const rising = point.close >= point.open;
          const candleWidth = Math.max(3, (width - pad * 2) / data.length / 2);
          const x = xFor(index);
          const openY = yFor(point.open);
          const closeY = yFor(point.close);
          return (
            <g key={`${point.time}-${index}`} className={rising ? "candle up" : "candle down"}>
              <line x1={x} y1={yFor(point.high)} x2={x} y2={yFor(point.low)} />
              <rect x={x - candleWidth / 2} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(Math.abs(openY - closeY), 2)} rx="1" />
            </g>
          );
        })}
        <polyline points={closePath} className="close-line" fill="none" />
        {opportunity.divergence.points.map((point) => {
          const localIndex = point.index - offset;
          if (localIndex < 0 || localIndex >= data.length) {
            return null;
          }

          return (
            <g key={`${point.time}-${point.price}`} className="divergence-marker">
              <circle cx={xFor(localIndex)} cy={yFor(point.price)} r="5" />
              <text x={xFor(localIndex) + 8} y={yFor(point.price) - 8}>
                {opportunity.divergence.type}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RsiChart({ data }: { data: IndicatorPoint[] }) {
  const slice = data.slice(-70);
  const width = 720;
  const height = 110;
  const pad = 16;
  const xFor = (index: number) => pad + (index / Math.max(slice.length - 1, 1)) * (width - pad * 2);
  const yFor = (value: number) => height - pad - (value / 100) * (height - pad * 2);
  const path = slice
    .map((point, index) => (point.rsi === null ? null : `${xFor(index)},${yFor(point.rsi)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div className="chart-card compact-chart">
      <div className="chart-title">
        <span>RSI 13</span>
        <span>25 / 75 thresholds</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="RSI chart">
        <line x1={pad} y1={yFor(75)} x2={width - pad} y2={yFor(75)} className="threshold overbought" />
        <line x1={pad} y1={yFor(25)} x2={width - pad} y2={yFor(25)} className="threshold oversold" />
        <polyline points={path} className="rsi-line" fill="none" />
      </svg>
    </div>
  );
}

function VolumeChart({ data }: { data: IndicatorPoint[] }) {
  const slice = data.slice(-70);
  const width = 720;
  const height = 90;
  const pad = 16;
  const max = Math.max(...slice.map((point) => point.volume));
  const barWidth = Math.max(3, (width - pad * 2) / slice.length - 2);

  return (
    <div className="chart-card compact-chart">
      <div className="chart-title">
        <span>Volume</span>
        <span>Relative activity</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volume chart">
        {slice.map((point, index) => {
          const x = pad + (index / Math.max(slice.length - 1, 1)) * (width - pad * 2);
          const barHeight = (point.volume / max) * (height - pad * 2);
          const elevated = (point.relativeVolume ?? 0) >= 1.25;

          return (
            <rect
              key={`${point.time}-${index}`}
              x={x - barWidth / 2}
              y={height - pad - barHeight}
              width={barWidth}
              height={barHeight}
              className={elevated ? "volume elevated" : "volume"}
              rx="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

function nullablePath(
  data: IndicatorPoint[],
  xFor: (index: number) => number,
  yFor: (value: number) => number,
  key: "upperBand" | "lowerBand" | "sma"
): string {
  return data
    .map((point, index) => {
      const value = point[key];
      return value === null ? null : `${xFor(index)},${yFor(value)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function Timeline({ events, isSimulated }: { events: AlertEvent[]; isSimulated: boolean }) {
  return (
    <div className="timeline">
      {events.map((event, index) => (
        <div className={`timeline-row ${event.severity}`} key={`${event.time}-${event.label}-${index}`}>
          <span>{isSimulated ? "Simulated" : formatMarketTimestamp(event.time)}</span>
          <p>{event.label}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdown({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="breakdown">
      {Object.entries(opportunity.scoreBreakdown).map(([label, value]) => (
        <div key={label}>
          <span>{toTitle(label)}</span>
          <div className="breakdown-bar">
            <span style={{ width: `${Math.min(100, (value / 25) * 100)}%` }} />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="metric">
      <span>{help ? <InlineHelp label={label} help={help} /> : label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="field-label">
      <span>{label}</span>
      <InfoTooltip content={help} />
    </span>
  );
}

function InlineHelp({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-help">
      <span>{label}</span>
      <InfoTooltip content={help} />
    </span>
  );
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <span className="info-tooltip" tabIndex={0} aria-label={content}>
      <HelpCircle size={14} />
      <span className="tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}

function PanelHeading({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="panel-heading">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{detail}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 90 ? "max" : score >= 80 ? "high" : score >= 70 ? "watch" : score >= 60 ? "early" : "low";

  return <span className={`score-badge ${tone}`}>{score}</span>;
}

function SignalTag({ side, label }: { side: SignalSide; label: string }) {
  return <span className={`signal-tag ${side}`}>{label}</span>;
}

function SideIcon({ side }: { side: SignalSide }) {
  if (side === "bullish") {
    return <TrendingUp size={16} />;
  }

  if (side === "bearish") {
    return <TrendingDown size={16} />;
  }

  return <SlidersHorizontal size={16} />;
}

function toTitle(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toUpperCase())
    .trim();
}

function filtersEqual(left: ScannerFilters, right: ScannerFilters): boolean {
  return (
    left.minScore === right.minScore &&
    left.side === right.side &&
    left.minRelativeVolume === right.minRelativeVolume &&
    left.minAverageVolume === right.minAverageVolume &&
    left.priceMin === right.priceMin &&
    left.priceMax === right.priceMax &&
    left.excludeEarningsDays === right.excludeEarningsDays &&
    left.hideLiquidityWarnings === right.hideLiquidityWarnings &&
    left.timeframe === right.timeframe
  );
}

function symbolsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((symbol, index) => symbol === right[index]);
}

export default App;
