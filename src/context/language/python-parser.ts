import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import { AbstractParser, EnclosingContext } from "../../constants";

export class PythonParser implements AbstractParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Python); // Initialize the parser with the Python grammar
  }

  findEnclosingContext(file: string, lineStart: number, lineEnd: number): EnclosingContext {
    const tree = this.parser.parse(file); // Parse the Python file content
    const rootNode = tree.rootNode;
  
    let largestContext = { size: 0, context: null as Parser.SyntaxNode | null };
    const relevantNodeTypes = ["class_definition", "function_definition"];
  
    // Recursive function to traverse the AST and update the largest context
    const visitNode = (node: Parser.SyntaxNode) => {
      const startLine = node.startPosition.row + 1; // Tree-sitter rows are 0-indexed
      const endLine = node.endPosition.row + 1;
  
      // Check if the node is relevant and spans the specified range
      if (relevantNodeTypes.includes(node.type) && startLine <= lineStart && endLine >= lineEnd) {
        const size = endLine - startLine;
        if (size < largestContext.size || largestContext.context === null) {
          largestContext.size = size;
          largestContext.context = node;
        }
      }
  
      // Recurse into child nodes
      for (const child of node.children) {
        visitNode(child);
      }
    };
  
    // Start the traversal
    visitNode(rootNode);
  
    return {
      enclosingContext: largestContext.context,
    } as EnclosingContext;
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      this.parser.parse(file); // Try parsing the Python file
      return { valid: true, error: "" }; // If no errors, it's valid
    } catch (e) {
      return { valid: false, error: e.message }; // Catch parsing errors
    }
  }
}