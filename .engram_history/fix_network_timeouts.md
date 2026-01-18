# Bug Fix: API Timeout Handling
Date: 2025-10-12
Author: Senior Dev

## Problem
Raw `fetch()` calls were causing unhandled promise rejections during network timeouts.

## Fix
We deprecated raw `fetch()` in favor of our wrapper `networkClient.safeRequest()`.

## Rule
**NEVER** use `fetch()` directly in UI components.
**ALWAYS** use `networkClient.safeRequest()` which handles retries and logging.

```javascript
// BAD
const data = await fetch('/api/user');

// GOOD
const data = await networkClient.safeRequest('/api/user');
```
