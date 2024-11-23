import {
  AbstractParser,
  PRFile,
  PatchInfo,
  getParserForExtension,
} from "../constants";
import * as diff from "diff";
import { JavascriptParser } from "./language/javascript-parser";
import { Node } from "@babel/traverse";
import { SyntaxNode } from "web-tree-sitter";

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
  scope: Node | SyntaxNode,
  hunk: diff.Hunk
) => {
  const res: string[] = [];
  const trimmedHunk = trimHunk(hunk);
  let functionStartLine: number;
  let functionEndLine: number;
  if (scope && typeof scope === 'object' && 'loc' in scope) {
    functionStartLine = scope.loc.start.line;
    functionEndLine = scope.loc.end.line;
  } else if (scope && typeof scope === 'object' && 'startPosition' in scope && 'endPosition' in scope) {
    functionStartLine = scope.startPosition.row;
    functionEndLine = scope.endPosition.row;
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

const diffContextPerHunk = async (
  file: PRFile,
  parser: AbstractParser
): Promise<string[]> => {
  console.log(`📊 Processing hunks for ${file.filename}`);
  const updatedFile = file.current_contents;
  const patches: PatchInfo[] = diff.parsePatch(file.patch);
  const scopeRangeHunkMap = new Map<string, diff.Hunk[]>();
  const scopeRangeNodeMap = new Map<string, Node | SyntaxNode>();
  const expandStrategy: diff.Hunk[] = [];
  const order: number[] = [];

  for (const [idx, patch] of patches.entries()) {
    try {
      const currentHunk: diff.Hunk = patch.hunks[0];
      const trimmedHunk = trimHunk(currentHunk);
      const insertions = currentHunk.lines.filter((line) =>
        line.startsWith("+")
      ).length;
      
      // Expand the search range significantly above and below the changed lines
      const contextRange = 0; // Increase this number to look further
      const lineStart = Math.max(1, trimmedHunk.newStart - contextRange);
      const lineEnd = trimmedHunk.newStart + insertions + contextRange;
      
      console.log(`🔍 Searching for context with expanded range: ${lineStart}-${lineEnd}`);
      
      const largest = await parser.findEnclosingContext(
        updatedFile,
        lineStart,
        lineEnd
      );
      
      const largestEnclosingFunction = largest.enclosingContext;

      if (largestEnclosingFunction && typeof largestEnclosingFunction === 'object' && 'startPosition' in largestEnclosingFunction && 'endPosition' in largestEnclosingFunction) {
        console.log(`✅ Found enclosing context: ${largestEnclosingFunction.type} at lines ${largestEnclosingFunction.startPosition.row}-${largestEnclosingFunction.endPosition.row}`);
        const enclosingRangeKey = `${largestEnclosingFunction.startPosition.row} -> ${largestEnclosingFunction.endPosition.row}`;
        let existingHunks = scopeRangeHunkMap.get(enclosingRangeKey) || [];
        existingHunks.push(currentHunk);
        scopeRangeHunkMap.set(enclosingRangeKey, existingHunks);
        scopeRangeNodeMap.set(enclosingRangeKey, largestEnclosingFunction);
      }
      else if (largestEnclosingFunction && typeof largestEnclosingFunction === 'object' && 'loc' in largestEnclosingFunction) {
        console.log(`✅ Found enclosing context: ${largestEnclosingFunction.type} at lines ${largestEnclosingFunction.loc.start.line}-${largestEnclosingFunction.loc.end.line}`);
        const enclosingRangeKey = `${largestEnclosingFunction.loc.start.line} -> ${largestEnclosingFunction.loc.end.line}`;
        let existingHunks = scopeRangeHunkMap.get(enclosingRangeKey) || [];
        existingHunks.push(currentHunk);
        scopeRangeHunkMap.set(enclosingRangeKey, existingHunks);
        scopeRangeNodeMap.set(enclosingRangeKey, largestEnclosingFunction);
      } else {
        console.log('❌ No enclosing function found even with expanded range');
        throw "No enclosing function.";
      }
      order.push(idx);
    } catch (exc) {
      console.log(`⚠️ Falling back to normal strategy for ${file.filename}`);
      console.log(exc);
      expandStrategy.push(patch.hunks[0]);
      order.push(idx);
    }
  }

  const scopeStategy: [string, diff.Hunk][] = []; // holds map range key and combined hunk: [[key, hunk]]
  for (const [range, hunks] of scopeRangeHunkMap.entries()) {
    const combinedHunk = combineHunks(updatedFile, hunks);
    scopeStategy.push([range, combinedHunk]);
  }

  const contexts: string[] = [];
  scopeStategy.forEach(([rangeKey, hunk]) => {
    const context = buildingScopeString(
      updatedFile,
      scopeRangeNodeMap.get(rangeKey) as Node | SyntaxNode,
      hunk
    ).join("\n");
    contexts.push(context);
  });
  expandStrategy.forEach((hunk) => {
    const context = expandHunk(file.old_contents, hunk);
    contexts.push(context);
  });
  return contexts;
};

export const smarterContextPatchStrategy = (file: PRFile) => {
  console.log(`🚀 smarterContextPatchStrategy for ${file.filename}`);
  const parser: AbstractParser = getParserForExtension(file.filename);
  console.log(`Parser for ${file.filename}: ${parser ? 'Found' : 'Not found'}`);
  if (parser != null) {
    console.log('Using functionContextPatchStrategy');
    return functionContextPatchStrategy(file, parser);
  } else {
    console.log('Falling back to expandedPatchStrategy');
    return expandedPatchStrategy(file);
  }
};

const functionContextPatchStrategy = async (
  file: PRFile,
  parser: AbstractParser
): Promise<string> => {
  console.log(`💡 functionContextPatchStrategy for ${file.filename}`);
  let res = null;
  try {
    const contextChunks = await diffContextPerHunk(file, parser);
    res = `## ${file.filename}\n\n${contextChunks.join("\n\n")}`;
  } catch (exc) {
    console.log('❌ Error in functionContextPatchStrategy:', exc);
    res = await expandedPatchStrategy(file);
  }
  return res;
};
