---
title: Lobby
summary: A residential community platform where supported requests are escalated to building management automatically.
tags: [SvelteKit, Supabase, Gemini]
order: 1
badge: 3rd place · MACATHON 2026
media:
  type: image
  src: /projects/lobby.png
  alt: Lobby residential community application interface
links:
  - label: GitHub
    href: https://github.com/ggkr-zzz/lobby
    kind: github
  - label: Live site
    href: https://lobby-pied.vercel.app
    kind: website
  - label: Devpost
    href: https://devpost.com/software/lobby-o4ubnj
    kind: devpost
---

Lobby is a mobile-first community platform for residential buildings. Managers
publish announcements while residents raise requests anonymously and support
issues affecting their neighbours.

When a request reaches a building's configured support threshold, Lobby marks
it as a priority, notifies the community, and queues a professionally formatted
email to management. The SvelteKit application uses Supabase for Postgres,
authentication, realtime updates, and storage, with Gemini assisting request
drafting and duplicate detection.

The project was submitted to MACATHON 2026 and placed third.
