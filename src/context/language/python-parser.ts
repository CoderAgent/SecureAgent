import { AbstractParser, EnclosingContext } from "../../constants";
import * as parser from 'python-ast';

interface Node {
  type: string;
  start: number;
  end: number;
  children: Node[];
}

// Helper function to convert a ParseTree to a Node
const parseTreeToNode = (parseTree: any): Node => {
  return {
    type: parseTree.type,
    start: parseTree.start,
    end: parseTree.end,
    children: parseTree.children ? parseTree.children.map(parseTreeToNode) : [],
  };
};

const processNode = (
  node: Node,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: Node | null
) => {
  // determining start and end line number
  const start = node.start;
  const end = start + (node.end - start);

  if (node.start <= lineStart && lineEnd <= node.end) {
    const size = node.end - node.start;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
}

export class PythonParser implements AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    // parse the file as a parseTree
    const ast = parser.parse(file);
    // Convert ParseTree to Node
    const rootNode = parseTreeToNode(ast);
    let largestEnclosingContext: Node | null = null;
    let largestSize = 0;
    const traverseAST = (node: Node) => {
      // check if the node is a current function or a class
      if (node.type === 'FunctionDef' || node.type === 'ClassDef') {
        ({ largestSize, largestEnclosingContext } = processNode(
          node,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
      }

      // Traverse the children nodes
      node.children.forEach((child) => traverseAST(child));
    };

    traverseAST(rootNode);
    return {
      enclosingContext: largestEnclosingContext,
    } as EnclosingContext;
  }
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      // tries to parse the Python code here
      const ast = parser.parse(file);
      const rootNode = parseTreeToNode(ast);
      return {
        valid: true,
        error: "",
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message,
      };
    }
  }
}
