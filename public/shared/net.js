// One WebSocket to the server that looks after itself: it reconnects with a
// growing pause when the connection drops, and measures the delay with pings.
export function createLink({ onOpen = () => {}, onMessage = () => {}, onState = () => {} } = {}) {
  let ws = null;
  let retryMs = 400;
  let retryTimer = null;
  let pingTimer = null;
  let pingSent = 0;
  let pingN = 0;
  let closedByUs = false;
  const link = { connected: false, rttMs: null, send, close, reconnectNow };

  function url() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  function open() {
    clearTimeout(retryTimer);
    try {
      ws = new WebSocket(url());
    } catch {
      return schedule();
    }
    const mine = ws;
    mine.onopen = () => {
      if (ws !== mine) return;
      link.connected = true;
      retryMs = 400;
      onState(true);
      onOpen();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        pingN = (pingN + 1) % 1e6;
        pingSent = performance.now();
        send({ t: 'ping', n: pingN });
      }, 2000);
    };
    mine.onmessage = (event) => {
      if (ws !== mine) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'pong') {
        if (msg.n === pingN) link.rttMs = Math.round(performance.now() - pingSent);
        return;
      }
      try {
        onMessage(msg);
      } catch (err) {
        console.error(err);
      }
    };
    mine.onclose = (event) => {
      if (ws !== mine) return;
      clearInterval(pingTimer);
      const was = link.connected;
      link.connected = false;
      link.rttMs = null;
      // 4002: this page was replaced by a newer one (the same room open in another tab).
      // Reconnecting would only make the two tabs take the room from each other for ever.
      if (event.code === 4002) closedByUs = true;
      if (was || event.code === 4002) onState(false, event.code);
      if (!closedByUs) schedule();
    };
    mine.onerror = () => { /* onclose follows */ };
    return undefined;
  }

  function schedule() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, retryMs);
    retryMs = Math.min(4000, retryMs * 1.7);
  }

  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    closedByUs = true;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (ws) ws.close();
  }

  // Coming back from a locked screen: do not wait for the next retry.
  function reconnectNow() {
    if (closedByUs || (ws && (ws.readyState === 0 || ws.readyState === 1))) return;
    retryMs = 400;
    open();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnectNow();
  });
  window.addEventListener('online', reconnectNow);
  open();
  return link;
}

// Safe access to localStorage / sessionStorage (private mode can refuse it).
export const storage = {
  get(area, key) {
    try {
      return window[area].getItem(key);
    } catch {
      return null;
    }
  },
  set(area, key, value) {
    try {
      if (value === null) window[area].removeItem(key);
      else window[area].setItem(key, value);
    } catch { /* not available: the choice is simply not remembered */ }
  },
};
