import { PythonParser } from "../src/context/language/python-parser";

describe("PythonParser", () => {
  const parser = new PythonParser();

  test("dryRun returns valid for correct Python code", () => {
    const validCode = `
def foo():
    pass
`;
    const result = parser.dryRun(validCode);
    expect(result.valid).toBe(true);
    expect(result.error).toBe("");
  });

  test("dryRun returns invalid for incorrect Python code", () => {
    const invalidCode = `
def foo(
    pass
`;
    const result = parser.dryRun(invalidCode);
    expect(result.valid).toBe(false);
    expect(result.error).not.toBe("");
  });

  test("findEnclosingContext returns correct context for a function", () => {
    const pythonCode = `
class MyClass:
    def method(self):
        pass

def foo():
    pass
`;
    const context = parser.findEnclosingContext(pythonCode, 3, 3); // Line 3 corresponds to 'method'
    expect(context.enclosingContext).toEqual("function_definition");
  });

  test("findEnclosingContext returns correct context for a class", () => {
    const pythonCode = `
class MyClass:
    def method(self):
        pass

def foo():
    pass
`;
    const context = parser.findEnclosingContext(pythonCode, 2, 3); // Line range includes the class
    expect(context.enclosingContext).toEqual("class_definition");
  });

  test("findEnclosingContext returns null for unrelated lines", () => {
    const pythonCode = `
class MyClass:
    def method(self):
        pass

def foo():
    pass
`;
    const context = parser.findEnclosingContext(pythonCode, 10, 11); // Outside any context
    expect(context.enclosingContext).toBeNull();
  });
});
