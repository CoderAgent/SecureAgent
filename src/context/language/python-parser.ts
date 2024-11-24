import { AbstractParser, EnclosingContext } from "../../constants";

export class PythonParser implements AbstractParser {
  /**
   * Finds the enclosing context (function or class) of a given line range.
   * @param file - The Python file content as a string.
   * @param lineStart - The starting line number.
   * @param lineEnd - The ending line number.
   * @returns The enclosing context, or null if not found.
   */
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    const lines = file.split("\n");
    let context: EnclosingContext = null;

    // Search upwards from the starting line to find the enclosing context
    for (let i = lineStart - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("def ")) {
        context = {
          type: "function",
          name: line.split(" ")[1].split("(")[0], // Extract function name
        };
        break;
      } else if (line.startsWith("class ")) {
        context = {
          type: "class",
          name: line.split(" ")[1].split("(")[0], // Extract class name
        };
        break;
      }
    }

    return context; // Returns null if no context is found
  }

  /**
   * Performs a dry run to check if the Python file is valid syntax.
   * @param file - The Python file content as a string.
   * @returns An object indicating validity and any error message.
   */
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const { spawnSync } = require("child_process");
      const result = spawnSync("python3", ["-m", "py_compile", "-"], {
        input: file, // Pass the file content to Python
        encoding: "utf-8",
      });

      if (result.status === 0) {
        return { valid: true, error: "" }; // File is valid
      } else {
        return { valid: false, error: result.stderr.toString() }; // Syntax error
      }
    } catch (e) {
      return { valid: false, error: e.message }; // Handle unexpected errors
    }
  }
}
