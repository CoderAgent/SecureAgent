"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavascriptParser = void 0;
var parser = require("@babel/parser");
var traverse_1 = require("@babel/traverse");
var processNode = function (path, lineStart, lineEnd, largestSize, largestEnclosingContext) {
    var _a = path.node.loc, start = _a.start, end = _a.end;
    if (start.line <= lineStart && lineEnd <= end.line) {
        var size = end.line - start.line;
        if (size > largestSize) {
            largestSize = size;
            largestEnclosingContext = path.node;
        }
    }
    return { largestSize: largestSize, largestEnclosingContext: largestEnclosingContext };
};
var JavascriptParser = /** @class */ (function () {
    function JavascriptParser() {
    }
    JavascriptParser.prototype.findEnclosingContext = function (file, lineStart, lineEnd) {
        var ast = parser.parse(file, {
            sourceType: "module",
            plugins: ["jsx", "typescript"], // To allow JSX and TypeScript
        });
        var largestEnclosingContext = null;
        var largestSize = 0;
        (0, traverse_1.default)(ast, {
            Function: function (path) {
                var _a;
                (_a = processNode(path, lineStart, lineEnd, largestSize, largestEnclosingContext), largestSize = _a.largestSize, largestEnclosingContext = _a.largestEnclosingContext);
            },
            TSInterfaceDeclaration: function (path) {
                var _a;
                (_a = processNode(path, lineStart, lineEnd, largestSize, largestEnclosingContext), largestSize = _a.largestSize, largestEnclosingContext = _a.largestEnclosingContext);
            },
        });
        return {
            enclosingContext: largestEnclosingContext,
        };
    };
    JavascriptParser.prototype.dryRun = function (file) {
        try {
            var ast = parser.parse(file, {
                sourceType: "module",
                plugins: ["jsx", "typescript"], // To allow JSX and TypeScript
            });
            return {
                valid: true,
                error: "",
            };
        }
        catch (exc) {
            return {
                valid: false,
                error: exc,
            };
        }
    };
    return JavascriptParser;
}());
exports.JavascriptParser = JavascriptParser;
