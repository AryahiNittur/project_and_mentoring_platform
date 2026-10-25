// Offline P(like) model. The swipe deck keeps the weighted score.
// A like is interest coverage >= 0.5 and time fit >= 0.5.
const { featureVector, features } = require("./rank");

function labelLike(student, project) {
    const vector = features(student, project);
    return vector.interest >= 0.5 && vector.time >= 0.5 ? 1 : 0;
}

function sigmoid(z) {
    if (z > 20) return 1;
    if (z < -20) return 0;
    return 1 / (1 + Math.exp(-z));
}

function dot(weights, vector) {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += weights[i] * vector[i];
    return sum;
}

function solveLinear(matrix, vector) {
    const size = vector.length;
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let col = 0; col < size; col++) {
        let pivot = col;
        for (let row = col + 1; row < size; row++) {
            if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
        }
        if (Math.abs(rows[pivot][col]) < 1e-12) return null;
        if (pivot !== col) {
            const swap = rows[col];
            rows[col] = rows[pivot];
            rows[pivot] = swap;
        }
        const divisor = rows[col][col];
        for (let cursor = col; cursor <= size; cursor++) rows[col][cursor] /= divisor;
        for (let row = 0; row < size; row++) {
            if (row === col) continue;
            const factor = rows[row][col];
            for (let cursor = col; cursor <= size; cursor++) rows[row][cursor] -= factor * rows[col][cursor];
        }
    }
    return rows.map((row) => row[size]);
}

function fitLogistic(rows, options = {}) {
    const l2 = options.l2 == null ? 0.01 : options.l2;
    const iterations = options.iterations == null ? 25 : options.iterations;
    const width = rows[0] ? rows[0].x.length : 5;
    const weights = new Array(width).fill(0);
    let bias = 0;

    for (let iteration = 0; iteration < iterations; iteration++) {
        const gradient = new Array(width + 1).fill(0);
        const hessian = Array.from({ length: width + 1 }, () => new Array(width + 1).fill(0));
        for (const row of rows) {
            const probability = sigmoid(dot(weights, row.x) + bias);
            const error = probability - row.y;
            const curve = Math.max(probability * (1 - probability), 1e-6);
            for (let i = 0; i < width; i++) gradient[i] += error * row.x[i];
            gradient[width] += error;
            for (let i = 0; i < width; i++) {
                for (let j = 0; j < width; j++) hessian[i][j] += curve * row.x[i] * row.x[j];
                hessian[i][width] += curve * row.x[i];
                hessian[width][i] += curve * row.x[i];
            }
            hessian[width][width] += curve;
        }
        const count = rows.length || 1;
        for (let i = 0; i < width; i++) {
            gradient[i] = gradient[i] / count + l2 * weights[i];
            for (let j = 0; j < width; j++) hessian[i][j] = hessian[i][j] / count + (i === j ? l2 : 0);
            hessian[i][width] /= count;
            hessian[width][i] /= count;
        }
        gradient[width] /= count;
        hessian[width][width] /= count;
        const step = solveLinear(hessian, gradient);
        if (!step) break;
        for (let i = 0; i < width; i++) weights[i] -= step[i];
        bias -= step[width];
    }

    return {
        weights,
        bias,
        predict(vector) {
            return sigmoid(dot(weights, vector) + bias);
        },
    };
}

function trainingRows(students, projects) {
    const rows = [];
    for (const student of students) {
        for (const project of projects) {
            if (!(Number(project.spots) > 0)) continue;
            rows.push({
                x: featureVector(student, project),
                y: labelLike(student, project),
                student,
                project,
            });
        }
    }
    return rows;
}

function fitOnStudents(students, projects, options) {
    return fitLogistic(trainingRows(students, projects), options);
}

module.exports = { labelLike, sigmoid, fitLogistic, trainingRows, fitOnStudents };
