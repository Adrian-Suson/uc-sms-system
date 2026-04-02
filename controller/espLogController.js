const MAX_BUFFER = 5000; // cap log entries in memory

// In-memory store (can be replaced with DB later)
const getStore = () => {
    if (!global.__ESP_LOG_STORE__) {
        global.__ESP_LOG_STORE__ = [];
    }
    return global.__ESP_LOG_STORE__;
};

exports.ingestLogs = (req, res) => {
    const { device, logs } = req.body || {};
    if (!device || !Array.isArray(logs)) {
        return res.status(400).json({ error: 'Invalid payload: require device and logs[]' });
    }

    const store = getStore();
    const now = Date.now();
    for (const l of logs) {
        store.push({
            device,
            ts: typeof l.t === 'number' ? l.t : now,
            level: l.lvl || 'INFO',
            message: l.msg || ''
        });
    }
    // Trim if exceeding
    if (store.length > MAX_BUFFER) {
        store.splice(0, store.length - MAX_BUFFER);
    }
    try {
        const io = global.getIO && global.getIO();
        if (io) io.emit('esp:logs', { device, count: logs.length });
    } catch { }
    res.json({ stored: logs.length, total: store.length });
};

exports.getLogs = (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const device = req.query.device;
    let store = getStore();
    if (device) {
        store = store.filter(l => l.device === device);
    }
    const slice = store.slice(-limit);
    res.json(slice);
};

exports.clearLogs = (req, res) => {
    if (req.query.confirm !== 'yes') {
        return res.status(400).json({ error: 'Add ?confirm=yes to clear' });
    }
    global.__ESP_LOG_STORE__ = [];
    res.json({ cleared: true });
};
