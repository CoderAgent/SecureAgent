import { AbstractParser, EnclosingContext } from "../../constants";
import * as pythonAst from "python-ast";

export interface PythonNode {
  type: string;
  start: number;
  end: number;
  lineno: number;
  end_lineno: number;
  body?: PythonNode[];
}

const processNode = (
  node: PythonNode,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: PythonNode | null
) => {
  if (node.lineno <= lineStart && lineEnd <= node.end_lineno) {
    const size = node.end_lineno - node.lineno;
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
    try {
      const ast = pythonAst.parse(file);
      let largestEnclosingContext: PythonNode = null;
      let largestSize = 0;

      const visitNode = (node: PythonNode) => {
        // Look for function definitions and class definitions
        if (node.type === "FunctionDef" || node.type === "ClassDef") {
          ({ largestSize, largestEnclosingContext } = processNode(
            node,
            lineStart,
            lineEnd,
            largestSize,
            largestEnclosingContext
          ));
        }

        // Recursively visit child nodes
        if (node.body) {
          node.body.forEach(visitNode);
        }
      };

      visitNode(ast as unknown as PythonNode);

      return {
        enclosingContext: largestEnclosingContext,
      } as EnclosingContext;
    } catch (error) {
      console.error("Error parsing Python file:", error);
      return { enclosingContext: null };
    }
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      pythonAst.parse(file);
      return {
        valid: true,
        error: "",
      };
    } catch (exc) {
      return {
        valid: false,
        error: exc.toString(),
      };
    }
  }
}
