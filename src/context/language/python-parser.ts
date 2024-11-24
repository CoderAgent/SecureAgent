import { AbstractParser, EnclosingContext } from "../../constants";
export class PythonParser implements AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    const tree = parser.parse(file);

    let largestEnclosingContext: SyntaxNode | null = null;
    let largestSize = 0;

    // Traverse the syntax tree
    const cursor = tree.walk();
    do {
      const node = cursor.currentNode;
      if (
        node.type === "function_definition" ||
        node.type === "class_definition"
      ) {
        ({ largestSize, largestEnclosingContext } = processNode(
          node,
          lineStart,
          lineEnd,
          largestSize,
          largestEnclosingContext
        ));
      }
    } while (cursor.gotoNextSibling() || cursor.gotoParent());

    return {
      enclosingContext: largestEnclosingContext,
    } as EnclosingContext;
  }

    return null;
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
