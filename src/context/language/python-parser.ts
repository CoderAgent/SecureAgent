import {
  AbstractParser,
  EnclosingContext,
  TreeSitterNode,
} from "../../constants";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import * as fs from "fs";

/**
 * Utility function to process AST node and check if it fully encloses a given line range.
 */
const processNode = (
  node: Parser.SyntaxNode,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: Parser.SyntaxNode | null
) => {
  const { startPosition, endPosition } = node;

  //Check if node fully encloses the target line range
  if (startPosition.row + 1 <= lineStart && lineEnd <= endPosition.row + 1) {
    const size = endPosition.row - startPosition.row;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

/**
 * Convert a Tree0sitter 'syntax node to a TreeSitternode
 */
const convertSyntaxNodeToTreeSitterNode = (
  syntaxNode: Parser.SyntaxNode
): TreeSitterNode => {
  return {
    type: syntaxNode.type,
    loc: {
      start: {
        line: syntaxNode.startPosition.row + 1,
        column: syntaxNode.startPosition.column,
      },
      end: {
        line: syntaxNode.endPosition.row + 1,
        column: syntaxNode.endPosition.column,
      },
    },
  };
};

/**
 * Python parser: A parser for python code that identifies syntatic contexts
 * and validates code as part of teh AI agents's code review system.
 */
export class PythonParser implements AbstractParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Python);
  }
  /**
   *
   * @param file - Content of the python file
   * @param lineStart  - Starting line number (1-based)
   * @param lineEnd - Ending line number (1-based)
   * @returns  An EnclosingContext object with the type of the the enclosing node
   */
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    // TODO: Implement this method for Python
    const tree = this.parser.parse(file);

    let largestEnclosingContext: Parser.SyntaxNode | null = null;
    let largestSize = 0;
    /**
     * Recursive fucntion to traverse AST nodes
     */
    const traverseNodes = (node: Parser.SyntaxNode) => {
      ({ largestSize, largestEnclosingContext } = processNode(
        node,
        lineStart,
        lineEnd,
        largestSize,
        largestEnclosingContext
      ));
      //Recursice inspect child nodes
      for (let i = 0; i < node.childCount; i++) {
        traverseNodes(node.child(i));
      }
    };

    //Start of the traversal from root node
    traverseNodes(tree.rootNode);

    return {
      enclosingContext: largestEnclosingContext
        ? convertSyntaxNodeToTreeSitterNode(largestEnclosingContext)
        : null,
    };
  }
  dryRun(file: string): { valid: boolean; error: string } {
    // TODO: Implement this method for Python
    try {
      const tree = this.parser.parse(file);

      if (tree.rootNode.hasError) {
        return {
          valid: false,
          error: "Syntax error in Python code",
        };
      }
      return { valid: true, error: "" };
    } catch (err) {
      return {
        valid: false,
        error: `Error parsing pyhton code: ${err.message}`,
      };
    }
  }
}
