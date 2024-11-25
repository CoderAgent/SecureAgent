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

const expandHunk = (
  contents: string,
  hunk: diff.Hunk,
  linesAbove: number = 5,
  linesBelow: number = 5
) => {
  const fileLines = contents.split("\n");
  const curExpansion: string[] = [];
  const start = Math.max(0, hunk.oldStart - 1 - linesAbove);
  const end = Math.min(
    fileLines.length,
    hunk.oldStart - 1 + hunk.oldLines + linesBelow
  );

  for (let i = start; i < hunk.oldStart - 1; i++) {
    curExpansion.push(fileLines[i]);
  }

  curExpansion.push(
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
  );
  hunk.lines.forEach((line) => {
    if (!curExpansion.includes(line)) {
      curExpansion.push(line);
    }
  });

  for (let i = hunk.oldStart - 1 + hunk.oldLines; i < end; i++) {
    curExpansion.push(fileLines[i]);
  }
  return curExpansion.join("\n");
};

const expandFileLines = (
  file: PRFile,
  linesAbove: number = 5,
  linesBelow: number = 5
) => {
  const fileLines = file.old_contents.split("\n");
  const patches: PatchInfo[] = diff.parsePatch(file.patch);
  const expandedLines: string[][] = [];
  patches.forEach((patch) => {
    patch.hunks.forEach((hunk) => {
      const curExpansion: string[] = [];
      const start = Math.max(0, hunk.oldStart - 1 - linesAbove);
      const end = Math.min(
        fileLines.length,
        hunk.oldStart - 1 + hunk.oldLines + linesBelow
      );

      for (let i = start; i < hunk.oldStart - 1; i++) {
        curExpansion.push(fileLines[i]);
      }

      curExpansion.push(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
      );
      hunk.lines.forEach((line) => {
        if (!curExpansion.includes(line)) {
          curExpansion.push(line);
        }
      });

      for (let i = hunk.oldStart - 1 + hunk.oldLines; i < end; i++) {
        curExpansion.push(fileLines[i]);
      }
      expandedLines.push(curExpansion);
    });
  });

  return expandedLines;
};

export const expandedPatchStrategy = (file: PRFile) => {
  const expandedPatches = expandFileLines(file);
  const expansions = expandedPatches
    .map((patchLines) => patchLines.join("\n"))
    .join("\n\n");
  return `## ${file.filename}\n\n${expansions}`;
};

export const rawPatchStrategy = (file: PRFile) => {
  return `## ${file.filename}\n\n${file.patch}`;
};

const trimHunk = (hunk: diff.Hunk): diff.Hunk => {
  const startIdx = hunk.lines.findIndex(
    (line) => line.startsWith("+") || line.startsWith("-")
  );
  const endIdx = hunk.lines
    .slice()
    .reverse()
    .findIndex((line) => line.startsWith("+") || line.startsWith("-"));
  const editLines = hunk.lines.slice(startIdx, hunk.lines.length - endIdx);
  return { ...hunk, lines: editLines, newStart: startIdx + hunk.newStart };
};

const buildingScopeString = (
  currentFile: string,
  scope: EnclosingContext,
  hunk: diff.Hunk
) => {
  const res: string[] = [];
  const trimmedHunk = trimHunk(hunk);
  let functionStartLine = 0;
  let functionEndLine = 0;
  if (isBabelNode(scope.enclosingContext)) {
    functionStartLine = scope.enclosingContext.loc.start.line;
    functionEndLine = scope.enclosingContext.loc.end.line;
  } else {
    functionStartLine = scope.enclosingContext.startPosition.row;
    functionEndLine = scope.enclosingContext.endPosition.row;
  }
  const updatedFileLines = currentFile.split("\n");
  // Extract the lines of the function
  const functionContext = updatedFileLines.slice(
    functionStartLine - 1,
    functionEndLine
  );
  // Calculate the index where the changes should be injected into the function
  const injectionIdx =
    hunk.newStart -
    functionStartLine +
    hunk.lines.findIndex(
      (line) => line.startsWith("+") || line.startsWith("-")
    );
  // Count the number of lines that should be dropped from the function
  const dropCount = trimmedHunk.lines.filter(
    (line) => !line.startsWith("-")
  ).length;

  const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  // Inject the changes into the function, dropping the necessary lines
  functionContext.splice(injectionIdx, dropCount, ...trimmedHunk.lines);

  res.push(functionContext.join("\n"));
  res.unshift(hunkHeader);
  return res;
};

/*
line nums are 0 index, file is 1 index
*/
const combineHunks = (
  file: string,
  overlappingHunks: diff.Hunk[]
): diff.Hunk => {
  if (!overlappingHunks || overlappingHunks.length === 0) {
    throw "Overlapping hunks are empty, this should never happen.";
  }
  const sortedHunks = overlappingHunks.sort((a, b) => a.newStart - b.newStart);
  const fileLines = file.split("\n");
  let lastHunkEnd = sortedHunks[0].newStart + sortedHunks[0].newLines;

  const combinedHunk: diff.Hunk = {
    oldStart: sortedHunks[0].oldStart,
    oldLines: sortedHunks[0].oldLines,
    newStart: sortedHunks[0].newStart,
    newLines: sortedHunks[0].newLines,
    lines: [...sortedHunks[0].lines],
    linedelimiters: [...sortedHunks[0].linedelimiters],
  };

  for (let i = 1; i < sortedHunks.length; i++) {
    const hunk = sortedHunks[i];

    // If there's a gap between the last hunk and this one, add the lines in between
    if (hunk.newStart > lastHunkEnd) {
      combinedHunk.lines.push(
        ...fileLines.slice(lastHunkEnd - 1, hunk.newStart - 1)
      );
      combinedHunk.newLines += hunk.newStart - lastHunkEnd;
    }

    combinedHunk.oldLines += hunk.oldLines;
    combinedHunk.newLines += hunk.newLines;
    combinedHunk.lines.push(...hunk.lines);
    combinedHunk.linedelimiters.push(...hunk.linedelimiters);

    lastHunkEnd = hunk.newStart + hunk.newLines;
  }
  return combinedHunk;
};

const diffContextPerHunk = (file: PRFile, parser: AbstractParser) => {
  const updatedFile = diff.applyPatch(file.old_contents, file.patch);
  const patches = diff.parsePatch(file.patch);
  if (!updatedFile || typeof updatedFile !== "string") {
    console.log("APPLYING PATCH ERROR - FALLINGBACK");
    throw "THIS SHOULD NOT HAPPEN!";
  }

  const hunks: diff.Hunk[] = [];
  const order: number[] = [];
  const scopeRangeHunkMap = new Map<string, diff.Hunk[]>();
  const scopeRangeNodeMap = new Map<string, EnclosingContext>();
  const expandStrategy: diff.Hunk[] = [];

  patches.forEach((p) => {
    p.hunks.forEach((hunk) => {
      hunks.push(hunk);
    });
  });

  console.info("processing hunks");
  hunks.forEach((hunk, idx) => {
    try {
      const trimmedHunk = trimHunk(hunk);
      const insertions = hunk.lines.filter((line) =>
        line.startsWith("+")
      ).length;
      const lineStart = trimmedHunk.newStart;
      const lineEnd = lineStart + insertions;
      console.info(`searching for context for range: ${lineStart}-${lineEnd}`);
      const largestEnclosingFunction = parser.findEnclosingContext(
        updatedFile,
        lineStart,
        lineEnd
      );
      const node = largestEnclosingFunction.enclosingContext;
      
      if (isBabelNode(node)) {
        console.log("Babel Node");
      }
      else {
        console.log("Python Node")
      }

      if (largestEnclosingFunction) {
        let enclosingRangeKey = "";
        if (isBabelNode(node)) {
          enclosingRangeKey = `${node.loc.start.line} -> ${node.loc.end.line}`;
          console.log('enclosed context rarnge for Babel Node: ', enclosingRangeKey)
        } else {
          enclosingRangeKey = `${node.startPosition.row} -> ${node.endPosition.row}`;
          console.log('enclosed context rarnge for Python Node: ', enclosingRangeKey)
        }
        let existingHunks = scopeRangeHunkMap.get(enclosingRangeKey) || [];
        existingHunks.push(hunk);
        scopeRangeHunkMap.set(enclosingRangeKey, existingHunks);
        scopeRangeNodeMap.set(enclosingRangeKey, largestEnclosingFunction);
      } else {
        throw "No enclosing function.";
      }
      order.push(idx);
    } catch (exc) {
      console.log(file.filename);
      console.log("NORMAL STRATEGY");
      console.log(exc);
      expandStrategy.push(hunk);
      order.push(idx);
    }
  });

  const scopeStategy: [string, diff.Hunk][] = []; // holds map range key and combined hunk: [[key, hunk]]
  for (const [range, hunks] of scopeRangeHunkMap.entries()) {
    const combinedHunk = combineHunks(updatedFile, hunks);
    scopeStategy.push([range, combinedHunk]);
  }

  const contexts: string[] = [];
  scopeStategy.forEach(([rangeKey, hunk]) => {
    const enclosingContext = scopeRangeNodeMap.get(rangeKey);
    const node = enclosingContext.enclosingContext;
    if (node && isBabelNode(node)) {
      const context = buildingScopeString(
        updatedFile,
        enclosingContext,
        hunk
      ).join("\n");
      contexts.push(context);
    } else if (node) {
      const context = buildingScopeString(
        updatedFile,
        enclosingContext,
        hunk
      ).join("\n");
      contexts.push(context);
    }
  });
  expandStrategy.forEach((hunk) => {
    const context = expandHunk(file.old_contents, hunk);
    contexts.push(context);
  });
  return contexts;
};

const functionContextPatchStrategy = (
  file: PRFile,
  parser: AbstractParser
): string => {
  let res = null;
  try {
    const contextChunks = diffContextPerHunk(file, parser);
    res = `## ${file.filename}\n\n${contextChunks.join("\n\n")}`;
  } catch (exc) {
    console.log(exc);
    res = expandedPatchStrategy(file);
  }
  return res;
};

export const smarterContextPatchStrategy = (file: PRFile) => {
  const parser: AbstractParser = getParserForExtension(file.filename);
  if (parser != null) {
    if (parser instanceof PythonParser) {
      console.log('Using PythonParser')
    }
    else if (parser instanceof JavascriptParser) {
      console.log('Using JavaScriptParser')
    }
    return functionContextPatchStrategy(file, parser);
  } else {
    console.info("Using basic parser");
    return expandedPatchStrategy(file);
  }
};