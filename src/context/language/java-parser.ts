import { AbstractParser, EnclosingContext } from "../../constants";
import traverse, { NodePath, Node } from "@babel/traverse";
import { SyntaxNode } from "tree-sitter";

const Parser = require("tree-sitter");
const Java = require("tree-sitter-java");

const parser = new Parser();
parser.setLanguage(Java);

const processNode = (
    node: SyntaxNode,
    lineStart: number,
    lineEnd: number,
    largestSize: number,
    largestEnclosingContext: SyntaxNode | null
) => {
    const start = node.startPosition;
    const end = node.endPosition;

    if (start.row <= lineStart && lineEnd <= end.row) {
        const size = end.row - start.row;
        if (size > largestSize) {
            largestSize = size;
            largestEnclosingContext = node;
        }
    }

    return { largestSize, largestEnclosingContext };
};

export class JavaParser implements AbstractParser {
    findEnclosingContext(
        file: string,
        lineStart: number,
        lineEnd: number
    ): EnclosingContext {
        const tree = parser.parse(file);
        let largestEnclosingContext: SyntaxNode | null = null;
        let largestSize = 0;

        const cursor = tree.walk();
        let first = true
        while (first || cursor.gotoNextSibling() || cursor.gotoParent())
        {
            const node = cursor.currentNode;
            const node_types = ["method_declaration", "class_declaration", "compilation_unit"];
            if (
                node_types.includes(node.type)
            ) {
                ({ largestSize, largestEnclosingContext } = processNode(
                    node,
                    lineStart,
                    lineEnd,
                    largestSize,
                    largestEnclosingContext,
                ));
            }
            first = false
        }
        return { enclosingContext: largestEnclosingContext } as EnclosingContext;
    }

    dryRun(file: string): { valid: boolean; error: string } {
      try {
        const tree = parser.parse(file);
        return {
          valid: true,
          error: "",
        };
      } catch (exc) {
        return {
          valid: false,
          error: exc,
        };
      }
    }
}
