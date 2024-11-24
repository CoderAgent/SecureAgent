import { AbstractParser, EnclosingContext } from "../../constants";
import { Python3Parser } from "python-parser";

// Function to process each node and determine if it is the largest enclosing context
const processNode = (
  node: any,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: any | null
) => {
  const { start, end } = node.loc;
  if (start.line <= lineStart && lineEnd <= end.line) {
    const size = end.line - start.line;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

export class PythonParser implements AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    const parser = new Python3Parser(); // Create a new instance of Python3Parser
    const ast = parser.parse(file); // Parse the Python file to get the AST
    let largestEnclosingContext: any = null; // Initialize the largest enclosing context
    let largestSize = 0; // Initialize the largest size

    // Custom listener class to traverse the AST
    class CustomListener {
      // What does the enterEveryRule method do?
      // It makes the listener visit every rule node in the AST
      // and process each node to determine the largest enclosing context
      // The ctx parameter is the context object for the rule node
      enterEveryRule(ctx: any): void {
        // Process each rule node
        ({ largestSize, largestEnclosingContext } = processNode(
          ctx,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
      }
    }

    const listener = new CustomListener();
    parser.listen(listener, ast); // Traverse the AST with the custom listener

    return {
      enclosingContext: largestEnclosingContext, // Return the largest enclosing context
    } as EnclosingContext;
  }
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const parser = new Python3Parser(); // Create a new instance of Python3Parser
      parser.parse(file); // Parse the Python file
      return {
        valid: true,
        error: "", // No errors
      };
    } catch (exc) {
      return {
        valid: false,
        error: exc.message, // Return the error message
      };
    }
  }
}
/*
    AST (Abstract Syntax Tree) is a tree representation of the source code
    It represents the structure of the code in a hierarchical manner
    The AST is used to analyze and manipulate the code programmatically
    The Python3Parser class is used to parse Python code and generate the AST
    --> As the code is parsed, the code is analyzed and broken down into parts
        --> These parts are represented as nodes in the AST
  */
