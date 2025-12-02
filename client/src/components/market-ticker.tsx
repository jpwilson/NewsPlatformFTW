import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TickerItem {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  currency?: string;
}

export function MarketTicker() {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTickerData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchTickerData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchTickerData = async () => {
    try {
      const items: TickerItem[] = [];

      // Fetch crypto prices (Bitcoin)
      try {
        const cryptoRes = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
        );
        const cryptoData = await cryptoRes.json();

        if (cryptoData.bitcoin) {
          items.push({
            symbol: "BTC",
            label: "Bitcoin",
            price: cryptoData.bitcoin.usd,
            change: cryptoData.bitcoin.usd_24h_change || 0,
            changePercent: cryptoData.bitcoin.usd_24h_change || 0,
            currency: "$",
          });
        }
      } catch (e) {
        console.error("Error fetching crypto:", e);
      }

      // Fetch forex rates (USD/GBP, USD/CNY)
      try {
        const forexRes = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD"
        );
        const forexData = await forexRes.json();

        if (forexData.rates) {
          items.push({
            symbol: "USD/GBP",
            label: "USD to GBP",
            price: 1 / forexData.rates.GBP,
            change: 0, // Free API doesn't include change
            changePercent: 0,
            currency: "£",
          });

          items.push({
            symbol: "USD/CNY",
            label: "USD to Yuan",
            price: forexData.rates.CNY,
            change: 0,
            changePercent: 0,
            currency: "¥",
          });
        }
      } catch (e) {
        console.error("Error fetching forex:", e);
      }

      // Fetch stock prices (using a simple proxy)
      // Note: For production, you'll want to use a proper API like Finnhub or Alpha Vantage
      try {
        const stockSymbols = ["TSLA", "MSTR"];

        for (const symbol of stockSymbols) {
          // Using Yahoo Finance alternative API (free, no key)
          const stockRes = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
          );
          const stockData = await stockRes.json();

          if (stockData?.chart?.result?.[0]) {
            const result = stockData.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];

            const currentPrice = meta.regularMarketPrice || quote.close[quote.close.length - 1];
            const previousClose = meta.previousClose || quote.close[0];
            const change = currentPrice - previousClose;
            const changePercent = (change / previousClose) * 100;

            items.push({
              symbol,
              label: symbol === "TSLA" ? "Tesla" : "MicroStrategy",
              price: currentPrice,
              change,
              changePercent,
              currency: "$",
            });
          }
        }
      } catch (e) {
        console.error("Error fetching stocks:", e);
      }

      setTickers(items);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching ticker data:", error);
      setIsLoading(false);
    }
  };

  if (isLoading || tickers.length === 0) {
    return (
      <div className="bg-muted/30 border-y border-border py-2 px-4">
        <div className="text-sm text-muted-foreground animate-pulse">
          Loading market data...
        </div>
      </div>
    );
  }

  // Duplicate the tickers array for seamless infinite scroll
  const duplicatedTickers = [...tickers, ...tickers, ...tickers];

  return (
    <div className="bg-muted/30 border-y border-border overflow-hidden relative">
      <div className="ticker-container">
        <div className="ticker-scroll">
          {duplicatedTickers.map((ticker, index) => (
            <div
              key={`${ticker.symbol}-${index}`}
              className="ticker-item inline-flex items-center gap-2 px-6 py-2 whitespace-nowrap"
            >
              <span className="font-semibold text-sm">{ticker.symbol}</span>
              <span className="text-sm">
                {ticker.currency}
                {ticker.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: ticker.symbol.startsWith("BTC") ? 0 : 2,
                })}
              </span>
              {ticker.changePercent !== 0 && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    ticker.changePercent > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {ticker.changePercent > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(ticker.changePercent).toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .ticker-container {
          display: flex;
          width: 100%;
        }

        .ticker-scroll {
          display: flex;
          animation: scroll 60s linear infinite;
        }

        .ticker-scroll:hover {
          animation-play-state: paused;
        }

        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }

        .ticker-item {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
