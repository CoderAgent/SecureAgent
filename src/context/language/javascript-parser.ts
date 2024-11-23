import { AbstractParser, EnclosingContext } from "../../constants";
import * as parser from "@babel/parser";
import traverse, { NodePath, Node } from "@babel/traverse";

const processNode = (
  path: NodePath<Node>,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: Node | null
) => {
  const { start, end } = path.node.loc;
  if (start.line <= lineStart && lineEnd <= end.line) {
    const size = end.line - start.line;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = path.node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

export class JavascriptParser implements AbstractParser {
  async findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): Promise<EnclosingContext> {
    const ast = parser.parse(file, {
      sourceType: "module",
      plugins: ["jsx", "typescript"], // To allow JSX and TypeScript
    });
    let largestEnclosingContext: Node = null;
    let largestSize = 0;
    traverse(ast, {
      Function(path) {
        ({ largestSize, largestEnclosingContext } = processNode(
          path,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
      },
      TSInterfaceDeclaration(path) {
        ({ largestSize, largestEnclosingContext } = processNode(
          path,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
      },
    });
    return {
      enclosingContext: largestEnclosingContext,
    } as EnclosingContext;
  }

  async dryRun(file: string): Promise<{ valid: boolean; error: string }> {
    try {
      const ast = parser.parse(file, {
        sourceType: "module",
        plugins: ["jsx", "typescript"], // To allow JSX and TypeScript
      });
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
