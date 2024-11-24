module.exports = {
  preset: "ts-jest", // Enables TypeScript support for Jest
  testEnvironment: "node", // Simulates a Node.js environment for tests
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.spec.ts"], // Matches test files in the "tests" directory
};
