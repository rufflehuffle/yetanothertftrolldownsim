// ============================================================
// postrd/snapshots.js — Build board/bench/shop snapshots from event log
// ============================================================

/**
 * Converts the round event log into an ordered array of snapshots.
 * Each snapshot captures the board, bench, shop, gold, and level
 * at a meaningful point (Start, Roll N, End).
 */
export function buildSnapshots(events) {
    const snapshots = [];
    let rollNum = 0;
    let hasRoundEnd = false;
    let pendingSnap = null;

    function flushPending() {
        if (pendingSnap) { snapshots.push(pendingSnap); pendingSnap = null; }
    }

    for (const e of events) {
        if (e.type === 'round:start') {
            flushPending();
            const shop = e.shop ? [...e.shop] : [];
            pendingSnap = { label: 'Start', shop, shopBought: shop.map(() => false), bench: e.bench, board: e.board, gold: e.gold, level: e.level };
        } else if (e.type === 'roll') {
            flushPending();
            rollNum++;
            const shop = e.shopAfter ? [...e.shopAfter] : [];
            pendingSnap = { label: `Roll ${rollNum}`, shop, shopBought: shop.map(() => false), bench: e.bench, board: e.board, gold: e.goldAfter, level: e.level };
        } else if (e.type === 'buy') {
            if (e.shopIndex != null && pendingSnap) pendingSnap.shopBought[e.shopIndex] = true;
        } else if (e.type === 'round:end') {
            flushPending();
            hasRoundEnd = true;
            const lastSnap = snapshots[snapshots.length - 1];
            snapshots.push({ label: 'End', shop: lastSnap?.shop ?? [], shopBought: lastSnap?.shopBought ?? [], bench: e.bench, board: e.board, gold: e.gold, level: e.level });
        }
    }
    flushPending();

    // Ensure there's always a terminal "End" snapshot
    if (!hasRoundEnd && snapshots.length > 0) {
        const last = snapshots[snapshots.length - 1];
        snapshots.push({ label: 'End', shop: last.shop, shopBought: last.shopBought, bench: last.bench, board: last.board, gold: last.gold, level: last.level });
    }

    return snapshots;
}
