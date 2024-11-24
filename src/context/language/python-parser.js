"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonParser = void 0;
var PythonParser = /** @class */ (function () {
    function PythonParser() {
    }
    /**
     * Finds the enclosing context (function or class) of a given line range.
     * @param file - The Python file content as a string.
     * @param lineStart - The starting line number.
     * @param lineEnd - The ending line number.
     * @returns The enclosing context, or null if not found.
     */
    PythonParser.prototype.findEnclosingContext = function (file, lineStart, lineEnd) {
        var lines = file.split("\n");
        var context = null;
        // Search upwards from the starting line to find the enclosing context
        for (var i = lineStart - 1; i >= 0; i--) {
            var line = lines[i].trim();
            if (line.startsWith("def ")) {
                context = {
                    type: "function",
                    name: line.split(" ")[1].split("(")[0], // Extract function name
                };
                break;
            }
            else if (line.startsWith("class ")) {
                context = {
                    type: "class",
                    name: line.split(" ")[1].split("(")[0], // Extract class name
                };
                break;
            }
        }
        return context; // Returns null if no context is found
    };
    /**
     * Performs a dry run to check if the Python file is valid syntax.
     * @param file - The Python file content as a string.
     * @returns An object indicating validity and any error message.
     */
    PythonParser.prototype.dryRun = function (file) {
        try {
            var spawnSync = require("child_process").spawnSync;
            var result = spawnSync("python3", ["-m", "py_compile", "-"], {
                input: file,
                encoding: "utf-8",
            });
            if (result.status === 0) {
                return { valid: true, error: "" }; // File is valid
            }
            else {
                return { valid: false, error: result.stderr.toString() }; // Syntax error
            }
        }
        catch (e) {
            return { valid: false, error: e.message }; // Handle unexpected errors
        }
    };
    return PythonParser;
}());
exports.PythonParser = PythonParser;
