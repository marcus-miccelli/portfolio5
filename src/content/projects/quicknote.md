---
title: quickNote
summary: A native Windows sticky-note application with Markdown editing, tabbed windows, and session restoration.
tags: [C, Win32, Markdown]
order: 5
media:
  type: image
  src: /projects/quicknote-generated.png
  alt: A polished preview of quickNote showing a Daily Focus note
links:
  - label: GitHub
    href: https://github.com/marcus-miccelli/NotesApp
    kind: github
---

quickNote is a native Windows application written in C. Each window can hold
multiple notes as tabs, with window geometry, tab order, and the active note
restored when the application starts again.

Notes remain ordinary Markdown files on disk. The editor renders Markdown live
through Win32 RichEdit and md4c while preserving the source delimiters, and a
formatting sidebar provides keyboard-accessible toggles for common styles.

The application includes a notification-area menu, multi-window note
management, an Inno Setup installer, and persistent state stored under the
user's application-data directory.
