// This file intentionally has lint issues for testing

const unusedVariable = 123;

function test() {
  var oldStyleVar = "should use const or let";
  console.log("test");
}

const x = 1

console.log(JSON.stringify({ result: "This file has lint issues" }));
