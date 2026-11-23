# Changelog

All notable changes to this project are listed in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-23

### Added

- An extension icon.
- Helpers that compare a classification with the default hints and preview the result.
- A Jev evaluation script with example cases (`scripts/evaluate.mjs`).
- Korean documentation and an example popup screenshot.

### Changed

- Clarify classification instructions and default collection boundaries for overlapping topics.
- Add guidance for writing collection criteria; existing saved criteria remain unchanged.

### Fixed

- Posts about AI usage norms go to the AI & Agents collection.
- The options page refreshes the list of settings issues after you save.

## [0.1.0] - 2026-10-28

### Added

- Save the current tab to Raindrop.io from the toolbar popup, the `Alt+Shift+S` shortcut, or the link context menu.
- Collection choice with TypeSafe Jev from the "Jev candidates" list, with a confidence threshold and a fallback collection.
- Domain and regex rules that set the collection before Jev.
- Tags from a fixed tag vocabulary, one Jev yes/no question for each tag.
- Raindrop authentication with the app.raindrop.io login cookie or a test token.
- Options buttons that add your Raindrop collections and tags as draft lines.
- A list of settings lines that the classifier ignores.
- Rule suggestions from the collections that you choose in the popup.
- An option to read the title and description of a linked page for right-click saves.
- A duplicate check: the popup shows a warning, and the shortcut does not save the URL again.
- A "Refresh" link in the popup that reloads the collection list.
- One retry and a clear error message when a Jev request times out after 15 seconds.

