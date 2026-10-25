// Pure selection helper: the UI owns fetching, animation, and persistence.
(function (root) {
    function nextSlots(rankedIds, current, kept, seen = []) {
        const locked = new Set(kept), visible = new Set(current), visited = new Set(seen);
        const unique = [...new Set(rankedIds)];
        const fresh = unique.filter(id => !locked.has(id) && !visible.has(id));
        const choices = [...fresh.filter(id => !visited.has(id)), ...fresh.filter(id => visited.has(id)),
            ...unique.filter(id => !locked.has(id) && visible.has(id))];
        let cursor = 0;
        return Array.from({length: 4}, (_, index) => locked.has(current[index]) ? current[index] : choices[cursor++])
            .filter(id => id !== undefined);
    }
    const api = {nextSlots};
    root.BridgeTeam = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
