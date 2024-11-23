import { AbstractParser, EnclosingContext } from "../../constants";
import Parser = require("web-tree-sitter");
let parser: Parser;

// Initialize Tree-sitter parser
async function initializeParser() {
  if (!parser) {
    await Parser.init();
    parser = new Parser();
    // You'll need to load the WASM file from your node_modules
    const Lang = await Parser.Language.load('/Users/bleach/Desktop/School/Headstarter/PR Agent/SecureAgent/node_modules/tree-sitter-python/tree-sitter-python.wasm');
    parser.setLanguage(Lang);
  }
  return parser;
}

export class PythonParser implements AbstractParser {
  private async getParser(): Promise<Parser> {
    console.log("🔍 Getting Python parser...");
    return await initializeParser();
  }

  async findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): Promise<EnclosingContext> {
    console.log(`🔍 Searching for context for range: ${lineStart} - ${lineEnd}`);
    
    const parser = await this.getParser();
    const tree = parser.parse(file);

    // Separate tracking for different types of contexts
    const contextNodes: { definitions: Parser.SyntaxNode[]; blocks: Parser.SyntaxNode[] } = {
      definitions: [], // function_definition, class_definition
      blocks: []      // if_statement, with_statement, block, etc
    };

    // Helper to check if a node contains our target range
    const nodeContainsRange = (node: Parser.SyntaxNode) => {
      if (node.endPosition.row - node.startPosition.row < 1) {
        return false;
      }

      return node.startPosition.row <= lineStart && 
             node.endPosition.row >= lineEnd &&
             node.text.trim().length > 0;
    };

    // Recursive function with context type separation
    const traverseTree = (node: Parser.SyntaxNode) => {
      if (node.endPosition.row - node.startPosition.row < 1) {
        return;
      }

      if (nodeContainsRange(node)) {
        const nodeType = node.type;
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'unnamed';

        if (['function_definition', 'class_definition'].includes(nodeType)) {
          console.log(`Found definition context ${nodeType}: ${name} at lines ${node.startPosition.row}-${node.endPosition.row}`);
          contextNodes.definitions.push(node);
        } else if (['if_statement', 'with_statement', 'block', 'while_statement', 'for_statement', 'try_statement'].includes(nodeType)) {
          console.log(`Found block context ${nodeType} at lines ${node.startPosition.row}-${node.endPosition.row}`);
          contextNodes.blocks.push(node);
        }
      }

      // Only traverse children if the node might contain our range
      if (node.startPosition.row <= lineEnd && node.endPosition.row >= lineStart) {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            traverseTree(child);
          }
        }
      }
    };

    traverseTree(tree.rootNode);

    // Find the smallest containing node, prioritizing definitions
    let bestNode = null;
    
    // First try to find the smallest definition
    if (contextNodes.definitions.length > 0) {
      bestNode = contextNodes.definitions.reduce((smallest, current) => {
        const smallestSize = smallest.endPosition.row - smallest.startPosition.row;
        const currentSize = current.endPosition.row - current.startPosition.row;
        return currentSize < smallestSize ? current : smallest;
      });
      console.log(`Selected definition context: ${bestNode.type} at lines ${bestNode.startPosition.row}-${bestNode.endPosition.row}`);
    }
    
    // If no definitions found, try blocks
    if (!bestNode && contextNodes.blocks.length > 0) {
      bestNode = contextNodes.blocks.reduce((largest, current) => {
        const largestSize = largest.endPosition.row - largest.startPosition.row;
        const currentSize = current.endPosition.row - current.startPosition.row;
        return currentSize > largestSize ? current : largest;
      });
      console.log(`Selected block context: ${bestNode.type} at lines ${bestNode.startPosition.row}-${bestNode.endPosition.row}`);
    }

    if (!bestNode) {
      console.log('No suitable context found');
    }

    return {
      enclosingContext: bestNode
    };
  }

  async dryRun(file: string): Promise<{ valid: boolean; error: string }> {
    console.log("🧪 Starting Python parser dryRun");
    try {
      const parser = await this.getParser();
      const tree = parser.parse(file);
      
      // Check if there are any ERROR nodes in the syntax tree
      let hasError = false;
      const cursor = tree.walk();
      
      do {
        if (cursor.currentNode.type === 'ERROR') {
          hasError = true;
          break;
        }
      } while (cursor.gotoNextSibling() || cursor.gotoParent());

      return {
        valid: !hasError,
        error: hasError ? "Syntax error in Python code" : "",
      };
    } catch (exc) {
      console.error("❌ Python parser dryRun error:", exc);
      return {
        valid: false,
        error: exc.toString(),
      };
    }
  }
}
