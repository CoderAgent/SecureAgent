import { AbstractParser, EnclosingContext } from "../../constants";
import { execSync } from "child_process";

export class PythonParser implements AbstractParser {
  /**
   * Finds the largest enclosing context for a given range of lines in a Python file.
   * This method uses Python's built-in `ast` module via a child process.
   * @param file The Python file content as a string.
   * @param lineStart The starting line of the range.
   * @param lineEnd The ending line of the range.
   * @returns An EnclosingContext object containing the largest enclosing AST node.
   */
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    try {
      const pythonScript = `
import ast, sys, json

def parse_file(file_content, line_start, line_end):
    tree = ast.parse(file_content)
    largest_node = None
    largest_size = 0

    for node in ast.walk(tree):
        if hasattr(node, "lineno") and hasattr(node, "end_lineno"):
            start_line = node.lineno
            end_line = node.end_lineno
            if start_line <= line_start and line_end <= end_line:
                size = end_line - start_line
                if size > largest_size:
                    largest_node = {
                        "type": type(node).__name__,
                        "start_line": start_line,
                        "end_line": end_line
                    }
                    largest_size = size

    return largest_node

file_content = sys.stdin.read()
line_start = int(sys.argv[1])
line_end = int(sys.argv[2])
result = parse_file(file_content, line_start, line_end)
print(json.dumps(result))
`;

      const result = execSync(
        `python3 -c "${pythonScript}" ${lineStart} ${lineEnd}`,
        { input: file }
      ).toString();

      const parsedNode = JSON.parse(result);

      if (parsedNode) {
        return {
          enclosingContext: parsedNode,
        };
      } else {
        return { enclosingContext: null };
      }
    } catch (err) {
      console.error("Error parsing Python file:", err);
      return { enclosingContext: null };
    }
  }

  /**
   * Performs a dry run to check if the Python file is valid and can be parsed.
   * @param file The Python file content as a string.
   * @returns An object containing `valid` (boolean) and `error` (string) if parsing fails.
   */
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const pythonScript = `
import ast, sys
try:
    ast.parse(sys.stdin.read())
    print("Valid")
except Exception as e:
    print(f"Invalid: {e}")
`;

      const result = execSync(`python3 -c "${pythonScript}"`, { input: file })
        .toString()
        .trim();

      if (result === "Valid") {
        return { valid: true, error: "" };
      } else {
        return { valid: false, error: result.replace("Invalid: ", "") };
      }
    } catch (err) {
      return { valid: false, error: err.message || "Unknown error" };
    }
  }
}
