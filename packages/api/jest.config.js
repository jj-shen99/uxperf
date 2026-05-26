/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!main.ts",
  ],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
};
