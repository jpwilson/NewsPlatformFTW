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

      // Fetch stock prices from backend proxy
      try {
        console.log("[Ticker] Fetching stocks from /api/market/stocks");
        const stockRes = await fetch("/api/market/stocks");
        console.log("[Ticker] Stock API response status:", stockRes.status);

        if (stockRes.ok) {
          const stockData = await stockRes.json();
          console.log("[Ticker] Stock data received:", stockData);
          if (Array.isArray(stockData) && stockData.length > 0) {
            items.push(...stockData);
            console.log("[Ticker] Added", stockData.length, "stocks to ticker");
          } else {
            console.warn("[Ticker] Stock data is empty or not an array:", stockData);
          }
        } else {
          const errorText = await stockRes.text();
          console.error("[Ticker] Stock API returned error:", stockRes.status, errorText);
        }
      } catch (e) {
        console.error("[Ticker] Error fetching stocks:", e);
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
                {ticker.symbol.startsWith("BTC")
                  ? ticker.price.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  : ticker.price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
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
