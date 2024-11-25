import { AbstractParser, EnclosingContext } from "../../constants";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";

const parser = new Parser();
parser.setLanguage(Python);

const processNode = (
  node: Parser.SyntaxNode,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: Parser.SyntaxNode | null
) => {
  const { startPosition, endPosition } = node;
  if (startPosition.row <= lineStart && lineEnd <= endPosition.row) {
    const size = endPosition.row - startPosition.row;
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
    let largestSize = 0;
    let largestEnclosingContext: Parser.SyntaxNode = null;

    const ast = parser.parse(file);
    const rootNode = ast.rootNode;
    
    const traverse = (node: Parser.SyntaxNode) => {

      if (node.type == "function_definition") {
        const result = processNode(node, lineStart, lineEnd, largestSize, largestEnclosingContext)
        largestSize = result.largestSize;
        largestEnclosingContext = result.largestEnclosingContext;
      }

      for (let i = 0; i < node.childCount; i++)
      {
        const child = node.child(i);
        if (child?.childCount > 0) {
          traverse(child)
        }
      }
    }
    traverse(rootNode)

    return {
      enclosingContext: largestEnclosingContext
    } as EnclosingContext;
  }
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const ast = parser.parse(file)
      return { valid: true, error: ""}
    }
    catch (exc) {
      return { valid: false, error: exc };
    }
  }
}