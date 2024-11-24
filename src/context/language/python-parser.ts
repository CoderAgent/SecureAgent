import { AbstractParser, EnclosingContext } from "../../constants";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";

export class PythonParser implements AbstractParser {
  parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Python);
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      this.parser.parse(file);
      return { valid: true, error: "" };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    const tree = this.parser.parse(file);
    let largestNode: Parser.SyntaxNode = null;
    let largestSize = 0;

    const visitNode = (node: Parser.SyntaxNode) => {
      const nodeStart = node.startPosition.row + 1;
      const nodeEnd = node.endPosition.row + 1;

      if (nodeStart <= lineStart && lineEnd <= nodeEnd) {
        const size = nodeEnd - nodeStart;
        if (size > largestSize) {
          largestSize = size;
          largestNode = node;
        }
      }

      for (const child of node.namedChildren) {
        visitNode(child);
      }
    };

    visitNode(tree.rootNode);

    return {
      enclosingContext: largestNode ? largestNode.type : null,
    };
  }
}
