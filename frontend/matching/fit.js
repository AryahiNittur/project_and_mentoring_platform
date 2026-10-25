// Fit P(like) on the mock students and print the weights.
// The live deck does not load this file.
const { students, projects } = require("./fixtures");
const { featureVector, scoreProject } = require("./rank");
const { fitOnStudents, labelLike, trainingRows } = require("./logistic");

function report() {
    const open = projects.filter((project) => project.spots > 0);
    const rows = trainingRows(students, open);
    const model = fitOnStudents(students, projects);
    const likes = rows.filter((row) => row.y === 1).length;
    const names = ["interest", "learn", "languages", "experience", "time"];
    const lines = [
        "Offline P(like). The live deck still sorts by the weighted score.",
        "Students: " + students.length + ". Open projects: " + open.length + ".",
        "Rows: " + rows.length + ". Likes: " + likes + ". Passes: " + (rows.length - likes) + ".",
        "Bias: " + model.bias.toFixed(4),
    ];
    model.weights.forEach((weight, index) => {
        lines.push(names[index] + ": " + weight.toFixed(4));
    });
    const maya = students[0];
    for (const project of [projects[0], projects[2]]) {
        lines.push(
            maya.name +
                " × " +
                project.title +
                ": score " +
                scoreProject(maya, project) +
                ", P(like) " +
                model.predict(featureVector(maya, project)).toFixed(3) +
                ", label " +
                labelLike(maya, project)
        );
    }
    return lines.join("\n");
}

if (require.main === module) {
    const text = report();
    console.log(text);
    if (text.includes("NaN")) process.exit(1);
}

module.exports = { report };
