// Browser replacement for the "undici" import used internally by @vercel/blob.
// The browser already provides fetch, so bundling the Node.js undici package is unnecessary.
export const fetch = globalThis.fetch.bind(globalThis);
