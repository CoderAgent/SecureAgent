import { AbstractParser, EnclosingContext } from "../../constants";
import * as Parser from "tree-sitter";
import * as Python from "tree-sitter-python";

interface TreeSitterNode {
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  type: string;
  children: TreeSitterNode[];
}

// Add interface to match expected Node structure
interface LocationData {
  line: number;
  column: number;
}

interface NodeLocation {
  start: LocationData;
  end: LocationData;
}

interface ASTNode {
  type: string;
  loc: NodeLocation;
  // Add other required properties from babel Node interface
  leadingComments?: any[] | null;
  innerComments?: any[] | null;
  trailingComments?: any[] | null;
  start?: number | null;
  end?: number | null;
  range?: [number, number];
  extra?: Record<string, unknown>;
}

const processNode = (
  node: TreeSitterNode,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: TreeSitterNode | null
) => {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  if (startLine <= lineStart && lineEnd <= endLine) {
    const size = endLine - startLine;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

export class PythonParser implements AbstractParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Python);
  }

  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    try {
      const tree = this.parser.parse(file);
      let largestEnclosingContext: TreeSitterNode = null;
      let largestSize = 0;

      const traverseNode = (node: TreeSitterNode) => {
        if (
          [
            "function_definition",
            "class_definition",
            "if_statement",
            "for_statement",
            "while_statement",
            "try_statement",
            "with_statement",
            "async_function_definition",
            "async_for_statement",
          ].includes(node.type)
        ) {
          ({ largestSize, largestEnclosingContext } = processNode(
            node,
            lineStart,
            lineEnd,
            largestSize,
            largestEnclosingContext
          ));
        }

        if (node.children) {
          node.children.forEach(traverseNode);
        }
      };

      traverseNode(tree.rootNode as unknown as TreeSitterNode);
      //ok
      // Convert TreeSitterNode to expected Node format
      const convertedNode: ASTNode | null = largestEnclosingContext
        ? {
            type: largestEnclosingContext.type,
            loc: {
              start: {
                line: largestEnclosingContext.startPosition.row + 1,
                column: largestEnclosingContext.startPosition.column,
              },
              end: {
                line: largestEnclosingContext.endPosition.row + 1,
                column: largestEnclosingContext.endPosition.column,
              },
            },
            // Add required properties
            leadingComments: null,
            innerComments: null,
            trailingComments: null,
            start: null,
            end: null,
          }
        : null;

      return {
        enclosingContext: convertedNode,
      } as EnclosingContext;
    } catch (error) {
      console.error("Error parsing Python code:", error);
      return { enclosingContext: null };
    }
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const tree = this.parser.parse(file);

      if (this.hasErrors(tree.rootNode)) {
        return {
          valid: false,
          error: "Syntax error in Python code",
        };
      }

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

  private hasErrors(node: any): boolean {
    if (node.type === "ERROR") {
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.hasErrors(child)) {
          return true;
        }
      }
    }

    return false;
  }
}
