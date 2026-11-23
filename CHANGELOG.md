# Changelog

All notable changes to this project are listed in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-23

### Added

- add default-hint comparison and classification preview helpers
- add Jev evaluation script with example cases
- add extension icon (#2)

### Fixed

- refresh settings issues after saving options
- route posts about AI usage norms to AI & Agents
- clarify bookmark classification criteria (#1)

## [0.1.1] - 2026-10-30

### Changed

- Clarify classification instructions and default collection boundaries for overlapping topics.
- Add guidance for writing collection criteria; existing saved criteria remain unchanged.
- Add Korean documentation and an example popup screenshot.

## [0.1.0] - 2026-10-28

### Added

- initial release 0.1.0

## [0.1.0] - 2026-10-21

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

