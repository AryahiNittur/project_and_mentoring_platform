const test = require("node:test");
const assert = require("node:assert/strict");
const { students, projects, student } = require("./fixtures");
const { featureVector, scoreProject } = require("./rank");
const { labelLike, fitLogistic, fitOnStudents, trainingRows } = require("./logistic");
const { report } = require("./fit");

function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function syntheticRows(seed, count) {
    const random = mulberry32(seed);
    const rows = [];
    for (let index = 0; index < count; index++) {
        const x = [random(), random(), random(), random(), random()];
        rows.push({ x, y: x[0] >= 0.5 && x[4] >= 0.5 ? 1 : 0 });
    }
    return rows;
}

test("a like requires interest coverage and time fit of at least one half", () => {
    const shortOnTime = {
        ...student,
        interests: ["Machine Learning"],
        hours_per_week: 1,
    };
    const twoInterests = { ...projects[0], interests: ["Machine Learning", "Healthcare"], hours_per_week: 4 };
    assert.equal(featuresOf(shortOnTime, twoInterests).interest, 0.5);
    assert.equal(featuresOf(shortOnTime, twoInterests).time, 0.25);
    assert.equal(labelLike(shortOnTime, twoInterests), 0);

    const half = { ...shortOnTime, hours_per_week: 2 };
    assert.equal(featuresOf(half, twoInterests).time, 0.5);
    assert.equal(featuresOf(half, twoInterests).interest, 0.5);
    assert.equal(labelLike(half, twoInterests), 1);

    const thinInterest = { ...student, interests: ["Machine Learning"], hours_per_week: 8 };
    const three = { ...projects[0], interests: ["Machine Learning", "Healthcare", "Data"], hours_per_week: 4 };
    assert.ok(featuresOf(thinInterest, three).interest < 0.5);
    assert.equal(labelLike(thinInterest, three), 0);

    const noTime = { ...student, hours_per_week: 2 };
    const long = { ...projects[0], hours_per_week: 8 };
    assert.equal(labelLike(noTime, long), 0);
    assert.equal(labelLike(student, projects[0]), 1);
    assert.equal(labelLike(student, projects[2]), 0);
});

function featuresOf(person, project) {
    const vector = featureVector(person, project);
    return { interest: vector[0], learn: vector[1], skill: vector[2], experience: vector[3], time: vector[4] };
}

test("the offline model learns interest and time, and the deck score stays weighted", () => {
    const rows = syntheticRows(24, 500);
    const likes = rows.filter((row) => row.y === 1).length;
    assert.ok(likes > 80 && likes < 250);
    const model = fitLogistic(rows, { l2: 0.001, iterations: 30 });
    for (const weight of model.weights) assert.ok(Number.isFinite(weight));
    assert.ok(Number.isFinite(model.bias));
    assert.ok(model.weights[0] > 0);
    assert.ok(model.weights[4] > 0);
    for (const index of [1, 2, 3]) {
        assert.ok(model.weights[0] > model.weights[index]);
        assert.ok(model.weights[4] > model.weights[index]);
    }

    let correct = 0;
    for (const row of rows) {
        const predicted = model.predict(row.x) >= 0.5 ? 1 : 0;
        if (predicted === row.y) correct += 1;
    }
    assert.ok(correct / rows.length > 0.8);

    const both = model.predict([1, 0, 0, 0, 1]);
    const neither = model.predict([0, 1, 1, 1, 0]);
    assert.ok(both > 0.5);
    assert.ok(neither < 0.5);
    assert.ok(both > neither);
});

test("mock students produce a finite model and do not replace the weighted score", () => {
    const rows = trainingRows(students, projects);
    assert.equal(rows.length, 15 * 7);
    assert.ok(rows.some((row) => row.y === 1));
    assert.ok(rows.some((row) => row.y === 0));
    const model = fitOnStudents(students, projects);
    const like = model.predict(featureVector(student, projects[0]));
    const pass = model.predict(featureVector(student, projects[2]));
    assert.ok(like > pass);
    assert.equal(scoreProject(student, projects[0]), 100);
    assert.equal(scoreProject(student, projects[2]), 55);
    const text = report();
    assert.match(text, /weighted score/);
    assert.match(text, /Clinical notes assistant: score 100/);
    assert.doesNotMatch(text, /NaN/);
});
