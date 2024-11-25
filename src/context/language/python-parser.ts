import { AbstractParser, EnclosingContext } from "../../constants";
import * as path from "path";
import { execSync } from "child_process"; // Use to execute Python script
import * as fs from "fs";

export class PythonParser implements AbstractParser {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.resolve(__dirname, "python_parser.py");
  }

  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext | null {
    try {
      const result = execSync(
        `python ${this.pythonScriptPath} "${file}" ${lineStart} ${lineEnd}`,
        { encoding: "utf8" }
      );

      const context = JSON.parse(result);

      if (context.error) {
        console.error("Error from Python script:", context.error);
        return null;
      }

      return {
        enclosingContext: context,
      } as EnclosingContext;
    } catch (error) {
      console.error("Failed to execute Python script:", error.message);
      return null;
    }
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      fs.readFileSync(file, "utf8");

      execSync(`python ${this.pythonScriptPath} "${file}" 1 1`);
      return { valid: true, error: "" };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}
