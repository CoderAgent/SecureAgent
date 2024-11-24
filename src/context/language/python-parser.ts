import { AbstractParser, EnclosingContext } from "../../constants";
import Parser from 'web-tree-sitter';

interface TreeSitterNode {
  type: string;
  startPosition: {
    row: number;
    column: number;
  };
  endPosition: {
    row: number;
    column: number;
  };
  children: TreeSitterNode[];
  parent: TreeSitterNode | null;
}

export class PythonParser implements AbstractParser {
  private parser: Parser | null = null;
  
  private async initializeParser() {
    if (this.parser) return;

    await Parser.init();
    this.parser = new Parser();
    const Lang = await Parser.Language.load('tree-sitter-python.wasm');
    this.parser.setLanguage(Lang);
  }

  private findLargestEnclosingNode(
    node: TreeSitterNode,
    lineStart: number,
    lineEnd: number,
    largestSize: number,
    largestNode: TreeSitterNode | null
  ): { largestSize: number; largestNode: TreeSitterNode | null } {

    if (
      (node.type === 'function_definition' ||
       node.type === 'class_definition' ||
       node.type === 'async_function_definition') &&
      node.startPosition.row <= lineStart &&
      node.endPosition.row >= lineEnd
    ) {
      const size = node.endPosition.row - node.startPosition.row;
      if (size > largestSize) {
        return {
          largestSize: size,
          largestNode: node
        };
      }
    }

    // Recursively check all children
    let currentLargest = { largestSize, largestNode };
    for (const child of node.children) {
      const result = this.findLargestEnclosingNode(
        child,
        lineStart,
        lineEnd,
        currentLargest.largestSize,
        currentLargest.largestNode
      );
      currentLargest = result;
    }

    return currentLargest;
  }

  private extractNodeName(node: TreeSitterNode): string {
    // Find the identifier node within function or class definition
    const identifierNode = node.children.find(child => 
      child.type === 'identifier'
    );
    return identifierNode ? identifierNode.toString() : 'anonymous';
  }

  async findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): Promise<EnclosingContext> {
    try {
      await this.initializeParser();
      if (!this.parser) {
        throw new Error('Parser initialization failed');
      }

      // Parse the file
      const tree = this.parser.parse(file);
      
      // Convert to 0-based line numbers for tree-sitter
      const zeroBasedStart = lineStart - 1;
      const zeroBasedEnd = lineEnd - 1;

      // Find the largest enclosing node
      const { largestNode } = this.findLargestEnclosingNode(
        tree.rootNode,
        zeroBasedStart,
        zeroBasedEnd,
        0,
        null
      );

      if (largestNode) {
        return {
          enclosingContext: {
            type: largestNode.type,
            name: this.extractNodeName(largestNode),
            loc: {
              start: {
                line: largestNode.startPosition.row + 1,
                column: largestNode.startPosition.column
              },
              end: {
                line: largestNode.endPosition.row + 1,
                column: largestNode.endPosition.column
              }
            }
          }
        };
      }

      return { enclosingContext: null };
    } catch (error) {
      console.error('Error parsing Python code:', error);
      return { enclosingContext: null };
    }
  }

  async dryRun(file: string): Promise<{ valid: boolean; error: string }> {
    try {
      await this.initializeParser();
      if (!this.parser) {
        throw new Error('Parser initialization failed');
      }

      const tree = this.parser.parse(file);
      
      const hasErrors = tree.rootNode.hasError();
      
      if (hasErrors) {
        return {
          valid: false,
          error: 'Syntax error in Python code'
        };
      }

      return {
        valid: true,
        error: ''
      };
    } catch (error) {
      return {
        valid: false,
        error: error.toString()
      };
    }
  }
}