const test = require('node:test');
const assert = require('node:assert/strict');
const {nextSlots} = require('./team.js');

test('keeps any selected people in their original slots and replaces everyone else', () => {
    assert.deepEqual(nextSlots([1,2,3,4,5,6,7,8], [1,2,3,4], [2,4]), [5,2,6,4]);
});
test('can keep all four and does not duplicate people when the pool is small', () => {
    assert.deepEqual(nextSlots([1,2,3,4,5], [1,2,3,4], [1,2,3,4]), [1,2,3,4]);
    const slots = nextSlots([1,2,3,4,5], [1,2,3,4], [2]);
    assert.equal(slots.length, 4);
    assert.equal(new Set(slots).size, 4);
    assert.equal(slots[1], 2);
    assert.ok(slots.includes(5));
});
test('new candidates appear before previously seen candidates', () => {
    assert.deepEqual(nextSlots([1,2,3,4,5,6,7,8,9,10,11,12], [5,6,7,8], [], [1,2,3,4,5,6,7,8]), [9,10,11,12]);
});
test('handles fewer than four available peers and an empty pool', () => {
    assert.deepEqual(nextSlots([2,3], [], []), [2,3]);
    assert.deepEqual(nextSlots([], [], []), []);
});
