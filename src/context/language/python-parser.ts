import { AbstractParser, EnclosingContext } from "../../constants";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";

const parser = new Parser();
parser.setLanguage(Python);

function updateLargestContext(
  node: Parser.SyntaxNode,
  lineStart: number,
  lineEnd: number,
  currentLargest: { size: number; context: Parser.SyntaxNode | null }
) {
  const { startPosition, endPosition } = node;

  if (startPosition.row <= lineStart && lineEnd <= endPosition.row) {
    const nodeSize = endPosition.row - startPosition.row;
    if (nodeSize > currentLargest.size) {
      currentLargest.size = nodeSize;
      currentLargest.context = node;
    }
  }
}

export class PythonParser implements AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    let largestContext = { size: 0, context: null as Parser.SyntaxNode | null };

    const ast = parser.parse(file);
    const rootNode = ast.rootNode;

    function traverseNode(node: Parser.SyntaxNode) {
      if (node.type === "function_definition") {
        updateLargestContext(node, lineStart, lineEnd, largestContext);
      }

      for (let i = 0; i < node.childCount; i++) {
        const childNode = node.child(i);
        if (childNode?.childCount > 0) {
          traverseNode(childNode);
        }
      }
    }

    traverseNode(rootNode);

    return {
      enclosingContext: largestContext.context,
    } as EnclosingContext;
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      parser.parse(file);
      return { valid: true, error: "" };
    } catch (error) {
      return { valid: false, error: error.toString() };
    }
  }
}
