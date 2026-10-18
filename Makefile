# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 theakki
# See the LICENSE file in the project root.

.PHONY: test lint check

test:
	npm test

lint:
	npm run lint

check: lint test
