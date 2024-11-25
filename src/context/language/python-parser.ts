import { AbstractParser, EnclosingContext } from "../../constants";
import * as ast from "python-ast"; // Python AST parsing library

/**
 * Processes a Python AST node to determine if it is the largest enclosing context.
 */
const processNode = (
  node: any,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: any
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
  /**
   * Finds the largest enclosing context for the specified line range.
   */
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    try {
      const parsed = ast.parse(file); // Parse the Python file into an AST
      let largestEnclosingContext: any = null;
      let largestSize = 0;

      // Recursive traversal function to check each node
      const traverseNode = (node: any) => {
        ({ largestSize, largestEnclosingContext } = processNode(
          node,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
        if (node.body) {
          node.body.forEach(traverseNode); // Recursively process child nodes
        }
      };

      traverseNode(parsed); // Start traversing from the root of the AST

      return {
        enclosingContext: largestEnclosingContext,
      } as EnclosingContext;
    } catch (error) {
      console.error("Error parsing Python file:", error);
      return null;
    }
  }

  /**
   * Performs a dry run to validate the Python file syntax.
   */
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      ast.parse(file); // Try parsing the file
      return { valid: true, error: "" };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}