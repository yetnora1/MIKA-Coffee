/*
 * MIKA COFFEE — order delivery
 *
 * Customers order from the menu; every order reaches the Staff screen (waiter and cashier)
 * at the same moment. Orders travel through a Firebase Realtime Database.
 *
 * GO LIVE (one time, about 5 minutes):
 *   1. Open https://console.firebase.google.com and create a project (Analytics can stay off).
 *   2. Build → Realtime Database → Create database → choose a location → "Start in locked mode".
 *   3. Open the Rules tab, replace everything with the rules below, and press Publish.
 *   4. Copy the database URL from the top of the Data tab
 *      (it looks like https://your-project-default-rtdb.firebaseio.com) into databaseURL below.
 *
 *   {
 *     "rules": {
 *       "orders": {
 *         "$day": {
 *           ".read": true,
 *           "$id": {
 *             ".write": "newData.exists()",
 *             ".validate": "newData.hasChildren(['code', 'table', 'items', 'total', 'status', 'createdAt'])"
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * Until databaseURL is filled in, the system runs in demo mode: orders only reach Staff screens
 * open on the same device, and customers are asked to show their order to the waiter.
 */
window.MIKA_ORDER_CONFIG = {
    databaseURL: '',
    // PIN for the Staff screen. It keeps customers out, but anyone reading this file can see it.
    staffPin: '1234',
};

(function () {
    'use strict';

    const config = window.MIKA_ORDER_CONFIG || {};
    const BASE = String(config.databaseURL || '').trim().replace(/\/+$/, '');
    const LIVE = /^https:\/\/\S+$/.test(BASE);
    const DEMO_KEY = 'mika_orders_demo';
    const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679'; // no look-alikes such as 0/O or 1/I
    const REQUEST_TIMEOUT_MS = 12000;

    function dayKey(date = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function newCode() {
        let code = '';
        for (let i = 0; i < 3; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        return code;
    }

    function splitPath(path) {
        return String(path).split('/').filter(Boolean);
    }

    function getAt(root, path) {
        return splitPath(path).reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), root) ?? null;
    }

    // Apply a Firebase-style write at a slash path: put replaces, patch merges children.
    function applyAt(root, path, data, merge) {
        if (merge) {
            const prefix = splitPath(path).join('/');
            return Object.entries(data || {}).reduce(
                (acc, [key, value]) => applyAt(acc, prefix ? `${prefix}/${key}` : key, value, false),
                root
            );
        }
        const parts = splitPath(path);
        if (!parts.length) return data ?? null;
        const out = root && typeof root === 'object' ? root : {};
        let node = out;
        for (const key of parts.slice(0, -1)) {
            if (!node[key] || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        }
        const last = parts[parts.length - 1];
        if (data == null) delete node[last];
        else node[last] = data;
        return out;
    }

    // ---------- Live: Firebase Realtime Database over REST + server-sent events ----------
    async function liveWrite(method, path, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(`${BASE}/${path}.json`, {
                method,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`Order server answered ${res.status}`);
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    function liveWatch(path, onValue, onStatus) {
        let source = null;
        let value = null;
        let retryTimer = null;
        let stopped = false;

        const connect = () => {
            onStatus('connecting');
            source = new EventSource(`${BASE}/${path}.json`);
            source.onopen = () => onStatus('live');
            source.addEventListener('put', e => {
                const msg = JSON.parse(e.data);
                value = applyAt(value, msg.path, msg.data, false);
                onValue(value);
            });
            source.addEventListener('patch', e => {
                const msg = JSON.parse(e.data);
                value = applyAt(value, msg.path, msg.data, true);
                onValue(value);
            });
            source.addEventListener('cancel', () => {
                // The database rules refused the read.
                source.close();
                onStatus('error');
            });
            source.onerror = () => {
                if (stopped) return;
                if (source.readyState === EventSource.CLOSED) {
                    onStatus('offline');
                    retryTimer = setTimeout(connect, 4000);
                } else {
                    onStatus('connecting'); // the browser reconnects by itself
                }
            };
        };

        connect();
        return () => {
            stopped = true;
            clearTimeout(retryTimer);
            if (source) source.close();
        };
    }

    // ---------- Demo: same-device only, through localStorage ----------
    const demoListeners = new Set();

    function readDemo() {
        try {
            return JSON.parse(localStorage.getItem(DEMO_KEY)) || {};
        } catch (e) {
            return {};
        }
    }

    function demoWrite(path, data, merge) {
        const all = applyAt(readDemo(), path, data, merge) || {};
        // Keep only today and yesterday so the demo store never grows.
        const keep = new Set([dayKey(), dayKey(new Date(Date.now() - 864e5))]);
        Object.keys(all.orders || {}).forEach(day => { if (!keep.has(day)) delete all.orders[day]; });
        localStorage.setItem(DEMO_KEY, JSON.stringify(all));
        demoListeners.forEach(fn => fn()); // other tabs hear the 'storage' event instead
        return Promise.resolve(data);
    }

    function demoWatch(path, onValue, onStatus) {
        const emit = () => onValue(getAt(readDemo(), path));
        const onStorage = e => { if (e.key === DEMO_KEY) emit(); };
        window.addEventListener('storage', onStorage);
        demoListeners.add(emit);
        onStatus('demo');
        setTimeout(emit, 0);
        return () => {
            window.removeEventListener('storage', onStorage);
            demoListeners.delete(emit);
        };
    }

    const write = LIVE ? liveWrite : (method, path, body) => demoWrite(path, body, method === 'PATCH');
    const watch = LIVE ? liveWatch : demoWatch;
    const noop = () => {};

    window.MikaOrders = {
        isLive: LIVE,
        staffPin: String(config.staffPin || ''),
        dayKey,

        /** Send a new order. items: [{ name, nameAm, price, qty }] */
        async place({ table, items, note }) {
            const cleanItems = items
                .filter(it => it && it.qty > 0)
                .map(it => ({
                    name: String(it.name || '').slice(0, 80),
                    nameAm: String(it.nameAm || '').slice(0, 80),
                    price: Math.max(0, Math.round(Number(it.price) || 0)),
                    qty: Math.min(50, Math.max(1, Math.round(Number(it.qty) || 1))),
                }));
            const order = {
                id: newId(),
                day: dayKey(),
                code: newCode(),
                table: String(table || '').trim().slice(0, 24),
                items: cleanItems,
                note: String(note || '').trim().slice(0, 240),
                total: cleanItems.reduce((sum, it) => sum + it.price * it.qty, 0),
                status: 'new',
                paid: false,
                createdAt: Date.now(),
            };
            await write('PUT', `orders/${order.day}/${order.id}`, order);
            return order;
        },

        /** Change fields on an order, e.g. { status: 'preparing' } or { paid: true, payMethod: 'cash' }. */
        update(day, id, fields) {
            return write('PATCH', `orders/${day}/${id}`, { ...fields, updatedAt: Date.now() });
        },

        /** Follow every order of one day. Returns a function that stops watching. */
        watchDay(day, onOrders, onStatus = noop) {
            return watch(`orders/${day}`, value => onOrders(value || {}), onStatus);
        },

        /** Follow one order. Returns a function that stops watching. */
        watchOrder(day, id, onOrder, onStatus = noop) {
            return watch(`orders/${day}/${id}`, value => onOrder(value), onStatus);
        },
    };
})();
