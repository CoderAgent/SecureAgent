import {
  AbstractParser,
  EnclosingContext,
  PRFile,
  PatchInfo,
  getParserForExtension,
  isBabelNode,
} from "../constants";
import * as diff from "diff";
import { JavascriptParser } from "./language/javascript-parser";
import { PythonParser } from "./language/python-parser";
import Parser from "tree-sitter";
import { Node } from "@babel/traverse";

// Function to expand a diff hunk by including lines above and below the hunk
const expandHunk = (
  contents: string,
  hunk: diff.Hunk,
  linesAbove: number = 5,
  linesBelow: number = 5
) => {
  const lines = contents.split("\n");
  const expansion: string[] = [];
  const start = Math.max(0, hunk.oldStart - 1 - linesAbove);
  const end = Math.min(lines.length, hunk.oldStart - 1 + hunk.oldLines + linesBelow);

  for (let i = start; i < hunk.oldStart - 1; i++) {
    expansion.push(lines[i]);
  }

  expansion.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
  hunk.lines.forEach((line) => {
    if (!expansion.includes(line)) expansion.push(line);
  });

  for (let i = hunk.oldStart - 1 + hunk.oldLines; i < end; i++) {
    expansion.push(lines[i]);
  }

  return expansion.join("\n");
};

// Function to expand all hunks in a file, adding surrounding context
const expandFileLines = (file: PRFile, linesAbove: number = 5, linesBelow: number = 5) => {
  const lines = file.old_contents.split("\n");
  const patches = diff.parsePatch(file.patch);
  const expandedHunks: string[][] = [];

  patches.forEach((patch) => {
    patch.hunks.forEach((hunk) => {
      const expansion: string[] = [];
      const start = Math.max(0, hunk.oldStart - 1 - linesAbove);
      const end = Math.min(lines.length, hunk.oldStart - 1 + hunk.oldLines + linesBelow);

      for (let i = start; i < hunk.oldStart - 1; i++) {
        expansion.push(lines[i]);
      }

      expansion.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      hunk.lines.forEach((line) => {
        if (!expansion.includes(line)) expansion.push(line);
      });

      for (let i = hunk.oldStart - 1 + hunk.oldLines; i < end; i++) {
        expansion.push(lines[i]);
      }

      expandedHunks.push(expansion);
    });
  });

  return expandedHunks;
};

// Strategy for generating an expanded patch for a file
export const expandedPatchStrategy = (file: PRFile) => {
  const expandedPatches = expandFileLines(file);
  const expansions = expandedPatches.map((patch) => patch.join("\n")).join("\n\n");
  return `## ${file.filename}\n\n${expansions}`;
};

// Strategy for returning the raw patch of a file
export const rawPatchStrategy = (file: PRFile) => `## ${file.filename}\n\n${file.patch}`;

// Trims a hunk to only include lines with changes
const trimHunk = (hunk: diff.Hunk): diff.Hunk => {
  const startIdx = hunk.lines.findIndex((line) => line.startsWith("+") || line.startsWith("-"));
  const endIdx = hunk.lines.slice().reverse().findIndex((line) => line.startsWith("+") || line.startsWith("-"));
  const trimmedLines = hunk.lines.slice(startIdx, hunk.lines.length - endIdx);
  return { ...hunk, lines: trimmedLines, newStart: startIdx + hunk.newStart };
};

// Builds a scope-specific string for a hunk, injecting changes into the context
const buildingScopeString = (
  fileContents: string,
  scope: EnclosingContext,
  hunk: diff.Hunk
) => {
  const fileLines = fileContents.split("\n");
  const trimmedHunk = trimHunk(hunk);
  const start = scope.enclosingContext.loc?.start.line ?? scope.enclosingContext.startPosition.row;
  const end = scope.enclosingContext.loc?.end.line ?? scope.enclosingContext.endPosition.row;
  const contextLines = fileLines.slice(start - 1, end);
  const injectionIdx = hunk.newStart - start + trimmedHunk.lines.findIndex((line) => line.startsWith("+") || line.startsWith("-"));
  const linesToReplace = trimmedHunk.lines.filter((line) => !line.startsWith("-")).length;

  contextLines.splice(injectionIdx, linesToReplace, ...trimmedHunk.lines);
  return [`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, ...contextLines].join("\n");
};

// Combines overlapping hunks into a single hunk
const combineHunks = (fileContents: string, hunks: diff.Hunk[]): diff.Hunk => {
  if (!hunks.length) throw new Error("No hunks to combine.");

  const fileLines = fileContents.split("\n");
  hunks.sort((a, b) => a.newStart - b.newStart);

  const combinedHunk: diff.Hunk = {
    ...hunks[0],
    lines: [...hunks[0].lines],
    linedelimiters: [...hunks[0].linedelimiters],
  };

  hunks.slice(1).forEach((hunk) => {
    combinedHunk.lines.push(...fileLines.slice(combinedHunk.newStart + combinedHunk.newLines - 1, hunk.newStart - 1));
    combinedHunk.lines.push(...hunk.lines);
    combinedHunk.linedelimiters.push(...hunk.linedelimiters);
    combinedHunk.newLines += hunk.newLines;
    combinedHunk.oldLines += hunk.oldLines;
  });

  return combinedHunk;
};

// Handles diff context extraction for hunks using a parser
const diffContextPerHunk = (file: PRFile, parser: AbstractParser) => {
  const updatedFile = diff.applyPatch(file.old_contents, file.patch);
  if (!updatedFile) throw new Error("Failed to apply patch.");

  const patches = diff.parsePatch(file.patch);
  const hunks = patches.flatMap((patch) => patch.hunks);
  const scopeMap = new Map<string, diff.Hunk[]>();
  const contexts: string[] = [];

  hunks.forEach((hunk) => {
    const trimmedHunk = trimHunk(hunk);
    const context = parser.findEnclosingContext(updatedFile, trimmedHunk.newStart, trimmedHunk.newStart + hunk.newLines);

    if (context) {
      const rangeKey = `${context.enclosingContext.loc?.start.line}-${context.enclosingContext.loc?.end.line}`;
      scopeMap.set(rangeKey, [...(scopeMap.get(rangeKey) || []), hunk]);
    } else {
      contexts.push(expandHunk(file.old_contents, hunk));
    }
  });

  scopeMap.forEach((hunks, key) => {
    const combinedHunk = combineHunks(updatedFile, hunks);
    const context = buildingScopeString(updatedFile, { enclosingContext: key }, combinedHunk);
    contexts.push(context);
  });

  return contexts;
};

// Strategy to generate smarter patches based on file context
export const smarterContextPatchStrategy = (file: PRFile) => {
  const parser = getParserForExtension(file.filename);
  if (parser) return functionContextPatchStrategy(file, parser);
  return expandedPatchStrategy(file);
};
