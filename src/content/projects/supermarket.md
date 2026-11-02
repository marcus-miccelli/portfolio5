---
title: SIG SuperMarket Bot
summary: A Python trading bot for SIG SuperMarket, combining basket arbitrage with convergence strategies informed by live Polymarket prices.
tags: [Python, Algorithmic Trading, WebSockets]
order: 5
media:
  type: image
  src: /projects/supermarket-interface.png
  alt: Illustrative prediction-market interface with a Texas Senate price chart, order book, and Yes/No trading panel.
---

Supermarket monitors SIG markets and Polymarket reference prices through realtime
feeds. It evaluates basket arbitrage and reference-driven convergence strategies,
with account-wide request scheduling, order reconciliation, and explicit
execution ownership. Trades execute on SIG; Polymarket supplies reference data.

The implementation is Python 3.13 with HTTPX and Supabase realtime. The repository
is private.

The preview is an AI-generated illustrative reconstruction of a prediction-market
interface, not a screenshot or a record of actual market history. It is informed by
SIG SuperMarket's Texas Senate market:
https://sig.thesuper.market/markets/293?tournament=midterm-elections
